/**
 * @since 1.0.0
 */
import {
  condition,
  defineQuery,
  defineSignal,
  executeChild,
  scheduleActivity,
  setHandler,
  sleep,
  startChild
} from "@temporalio/workflow"
import * as Activity from "effect/unstable/workflow/Activity"
import * as Duration from "effect/Duration"
import type { DurableClock } from "effect/unstable/workflow/DurableClock"
import type * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import type {
  CompleteDeferredSignal,
  ScheduleClockSignal,
  TemporalDeferredResult,
  TemporalWorkflowState
} from "./TemporalWorkflowProtocol.js"
import {
  completeDeferredSignalName,
  deferredResultQueryName,
  interruptSignalName,
  resumeSignalName,
  scheduleClockSignalName,
  workflowStateQueryName
} from "./TemporalWorkflowProtocol.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowRuntimeOptions {
  readonly activityOptions?: Parameters<typeof scheduleActivity>[2] | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalActivityExecutionContext {
  readonly workflowName: string
  readonly executionId: string
  readonly attempt: number
}

/**
 * @since 1.0.0
 * @category Protocol
 */
export const workflowStateQuery = defineQuery<TemporalWorkflowState>(workflowStateQueryName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const deferredResultQuery = defineQuery<TemporalDeferredResult, [name: string]>(deferredResultQueryName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const interruptSignal = defineSignal(interruptSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const resumeSignal = defineSignal(resumeSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const completeDeferredSignal = defineSignal<[CompleteDeferredSignal]>(completeDeferredSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const scheduleClockSignal = defineSignal<[ScheduleClockSignal]>(scheduleClockSignalName)

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowRuntimeState {
  readonly executionId: string
  status: TemporalWorkflowState["status"]
  interrupted: boolean
  resumed: boolean
  result: TemporalWorkflowState["result"]
  suspendedCause: TemporalWorkflowState["suspendedCause"]
  readonly deferreds: Map<string, Exit.Exit<unknown, unknown>>
  readonly clocks: Map<string, ScheduleClockSignal>
  readonly clockDeferreds: Map<string, string>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeRuntimeState = (
  executionId: string
): TemporalWorkflowRuntimeState => ({
  executionId,
  status: "running",
  interrupted: false,
  resumed: false,
  result: undefined,
  suspendedCause: undefined,
  deferreds: new Map(),
  clocks: new Map(),
  clockDeferreds: new Map()
})

/**
 * @since 1.0.0
 * @category Runtime
 */
export const installBaseHandlers = (
  state: TemporalWorkflowRuntimeState
): void => {
  setHandler(workflowStateQuery, () => ({
    executionId: state.executionId,
    status: state.status,
    result: state.result,
    suspendedCause: state.suspendedCause
  }))
  setHandler(deferredResultQuery, (name) => {
    const exit = state.deferreds.get(name)
    return exit === undefined
      ? { found: false }
      : { found: true, exit }
  })
  setHandler(interruptSignal, () => {
    state.interrupted = true
    state.status = "suspended"
  })
  setHandler(resumeSignal, () => {
    state.resumed = true
    state.status = "running"
  })
  setHandler(completeDeferredSignal, ({ name, exit }) => {
    state.deferreds.set(name, exit)
    state.resumed = true
  })
  setHandler(scheduleClockSignal, (clock) => {
    state.clocks.set(clock.name, clock)
  })
}

const defaultActivityOptions: Parameters<typeof scheduleActivity>[2] = {
  startToCloseTimeout: "1 minute"
}

const runEffect = <A, E>(
  effect: Effect.Effect<A, E, never>
): Promise<A> => Effect.runPromise(effect)

const provideWorkflowServices = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  engine: WorkflowEngine.WorkflowEngine["Service"],
  instance: WorkflowEngine.WorkflowInstance["Service"]
): Effect.Effect<A, E, Exclude<R, WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance>> =>
  effect.pipe(
    Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
    Effect.provideService(WorkflowEngine.WorkflowInstance, instance)
  ) as any

const completeClock = (
  state: TemporalWorkflowRuntimeState,
  clockName: string,
  deferredName: string,
  durationMs: number
): void => {
  if (state.clockDeferreds.has(clockName)) {
    return
  }
  state.clockDeferreds.set(clockName, deferredName)
  void sleep(durationMs).then(() => {
    state.deferreds.set(deferredName, Exit.void)
    state.resumed = true
  })
}

/**
 * Creates the Effect workflow engine that runs inside Temporal's workflow
 * isolate. It bridges Effect activities to Temporal activities and stores
 * DurableDeferred / DurableClock state in workflow history through signals and
 * timers.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeWorkflowEngine = (
  state: TemporalWorkflowRuntimeState,
  options: TemporalWorkflowRuntimeOptions = {}
): WorkflowEngine.WorkflowEngine["Service"] => {
  const activityOptions = options.activityOptions ?? defaultActivityOptions

  return WorkflowEngine.makeUnsafe({
    register: () => Effect.void,
    execute: (workflow: Workflow.Any, executeOptions: {
      readonly executionId: string
      readonly payload: object
      readonly discard: boolean
    }) =>
      executeOptions.discard
        ? Effect.promise(() =>
          startChild(workflow.name, {
            workflowId: executeOptions.executionId,
            args: [executeOptions.payload]
          })
        ).pipe(Effect.asVoid)
        : Effect.tryPromise({
          try: () =>
            executeChild(workflow.name, {
              workflowId: executeOptions.executionId,
              args: [executeOptions.payload]
            }),
          catch: (cause) => cause
        }).pipe(
          Effect.exit,
          Effect.map((exit) => new Workflow.Complete({ exit }))
        ),
    poll: () => Effect.succeed(Option.none()),
    interrupt: (_workflow: Workflow.Any, _executionId: string) => Effect.sync(() => {
      state.interrupted = true
      state.status = "suspended"
    }),
    interruptUnsafe: (_workflow: Workflow.Any, _executionId: string) => Effect.sync(() => {
      state.interrupted = true
      state.status = "suspended"
    }),
    resume: (_workflow: Workflow.Any, _executionId: string) => Effect.sync(() => {
      state.resumed = true
      state.status = "running"
    }),
    activityExecute: (activity: Activity.Any, attempt: number) =>
      Effect.gen(function*() {
        const instance = yield* WorkflowEngine.WorkflowInstance
        return yield* Effect.promise(() =>
          scheduleActivity<Workflow.Result<unknown, unknown>>(
            activity.name,
            [
              {
                workflowName: instance.workflow.name,
                executionId: instance.executionId,
                attempt
              } satisfies TemporalActivityExecutionContext
            ],
            activityOptions
          )
        )
      }),
    deferredResult: (deferred: DurableDeferred.Any) =>
      Effect.sync(() => Option.fromNullishOr(state.deferreds.get(deferred.name))),
    deferredDone: (options: {
      readonly workflowName: string
      readonly executionId: string
      readonly deferredName: string
      readonly exit: Exit.Exit<unknown, unknown>
    }) =>
      Effect.sync(() => {
        if (!state.deferreds.has(options.deferredName)) {
          state.deferreds.set(options.deferredName, options.exit)
        }
        state.resumed = true
      }),
    scheduleClock: (_workflow: Workflow.Any, { clock }: { readonly executionId: string; readonly clock: DurableClock }) =>
      Effect.sync(() => {
        const durationMs = Math.max(1, Duration.toMillis(clock.duration))
        state.clocks.set(clock.name, { name: clock.name, durationMs })
        completeClock(state, clock.name, clock.deferred.name, durationMs)
      })
  } as any) as WorkflowEngine.WorkflowEngine["Service"]
}

/**
 * Runs an Effect workflow implementation as a Temporal workflow function.
 *
 * The returned function is intended to be exported from a Temporal workflows
 * module under the same name used when starting the workflow.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeWorkflow = <
  Name extends string,
  Payload extends Workflow.AnyStructSchema,
  Success extends Schema.Top,
  Error extends Schema.Top,
  R
>(
  workflow: Workflow.Workflow<Name, Payload, Success, Error>,
  execute: (payload: Payload["Type"], executionId: string) => Effect.Effect<Success["Type"], Error["Type"], R>,
  options: TemporalWorkflowRuntimeOptions = {}
): ((payload: Payload["Type"]) => Promise<Success["Type"]>) =>
  async (payload) => {
    const executionId = await runEffect(workflow.executionId(payload) as Effect.Effect<string, never, never>)
    const state = makeRuntimeState(executionId)
    installBaseHandlers(state)
    const engine = makeWorkflowEngine(state, options)

    while (true) {
      if (state.interrupted) {
        state.status = "suspended"
        await waitForResume(state)
        if (state.interrupted) {
          state.interrupted = false
        }
      }

      state.status = "running"
      state.suspendedCause = undefined

      const instance = WorkflowEngine.WorkflowInstance.initial(workflow, executionId)
      instance.interrupted = state.interrupted

      const result = await runEffect(
        provideWorkflowServices(
          execute(payload, executionId).pipe(Workflow.intoResult),
          engine,
          instance
        ) as Effect.Effect<Workflow.Result<Success["Type"], Error["Type"]>, never, never>
      )

      state.result = result as any

      if (result._tag === "Complete") {
        state.status = "completed"
        return await runEffect(result.exit as Effect.Effect<Success["Type"], Error["Type"], never>)
      }

      state.status = "suspended"
      state.suspendedCause = result.cause
      await waitForResume(state)
    }
  }

/**
 * Converts Effect workflow activities into Temporal worker activity handlers.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeActivities = (
  activities: Iterable<Activity.AnyWithProps>
): Record<string, (context: TemporalActivityExecutionContext) => Promise<Workflow.Result<unknown, unknown>>> => {
  const handlers: Record<string, (context: TemporalActivityExecutionContext) => Promise<Workflow.Result<unknown, unknown>>> = {}
  for (const activity of activities) {
    handlers[activity.name] = async (context) => {
      const workflow = { name: context.workflowName } as Workflow.Any
      const instance = WorkflowEngine.WorkflowInstance.initial(workflow, context.executionId)
      const result = await runEffect(
        provideWorkflowServices(
          activity.executeEncoded.pipe(Workflow.intoResult),
          makeWorkflowEngine(makeRuntimeState(context.executionId)),
          instance
        ).pipe(Effect.provideService(Activity.CurrentAttempt, context.attempt)) as Effect.Effect<
          Workflow.Result<unknown, unknown>,
          never,
          never
        >
      )
      return result
    }
  }
  return handlers
}

/**
 * @since 1.0.0
 * @category Runtime
 */
export const waitForResume = async (
  state: TemporalWorkflowRuntimeState
): Promise<void> => {
  await condition(() => state.resumed || state.interrupted)
  state.resumed = false
}
