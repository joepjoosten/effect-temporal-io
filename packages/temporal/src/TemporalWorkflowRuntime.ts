/**
 * @since 1.0.0
 */
import * as Duration from "effect/Duration"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Activity from "effect/unstable/workflow/Activity"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  proxyLocalActivities,
  setHandler,
  sleep,
  workflowInfo
} from "@temporalio/workflow"
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
  clocks: new Map()
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
    state.resumed = false
    state.status = "suspended"
  })
  setHandler(resumeSignal, () => {
    state.interrupted = false
    state.resumed = true
    state.status = "running"
  })
  setHandler(completeDeferredSignal, ({ name, exit }) => {
    state.deferreds.set(name, exit)
    if (!state.interrupted) {
      state.resumed = true
      state.status = "running"
    }
  })
  setHandler(scheduleClockSignal, (clock) => {
    state.clocks.set(clock.name, clock)
  })
}

/**
 * @since 1.0.0
 * @category Runtime
 */
export const waitForResume = async (
  state: TemporalWorkflowRuntimeState
): Promise<void> => {
  await condition(() => state.resumed)
  state.resumed = false
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalActivityInvocation {
  readonly executionId: string
  readonly attempt: number
}

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalActivityProxy =
  | {
    readonly local?: false | undefined
    readonly options?: Parameters<typeof proxyActivities>[0] | undefined
  }
  | {
    readonly local: true
    readonly options?: Parameters<typeof proxyLocalActivities>[0] | undefined
  }

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowRuntimeOptions<
  Payload,
  Success,
  Error,
  R
> {
  readonly workflow: Workflow.Workflow<any, any, any, any>
  readonly execute: (
    payload: Payload,
    executionId: string
  ) => Effect.Effect<Success, Error, R>
  readonly activityProxy?: TemporalActivityProxy | undefined
  readonly provide?: ((<A, E, R2>(effect: Effect.Effect<A, E, R2>) => Effect.Effect<A, E, never>)) | undefined
}

const defaultActivityOptions = {
  startToCloseTimeout: "10 minutes"
} satisfies Parameters<typeof proxyActivities>[0]

const AnyOrVoid = Schema.Union([Schema.Any, Schema.Void])
const WorkflowResultSchema = Workflow.Result({
  success: AnyOrVoid,
  error: AnyOrVoid
})
const WorkflowResultCodec = Schema.toCodecJson(WorkflowResultSchema)
const encodeWorkflowResult = Schema.encodeUnknownSync(WorkflowResultCodec)
const decodeWorkflowResult = Schema.decodeUnknownSync(WorkflowResultCodec)

const executionIdFromWorkflowId = (
  workflowId: string
): string => {
  const index = workflowId.lastIndexOf("/")
  return index === -1 ? workflowId : workflowId.slice(index + 1)
}

const unsupported = (message: string): Effect.Effect<never, never> =>
  Effect.die(new Error(message))

const makeActivityCaller = (
  activityProxy: TemporalActivityProxy | undefined
): Record<string, (input: TemporalActivityInvocation) => Promise<Workflow.ResultEncoded<unknown, unknown>>> =>
  activityProxy?.local === true
    ? proxyLocalActivities<Record<string, (input: TemporalActivityInvocation) => Promise<Workflow.ResultEncoded<unknown, unknown>>>>(
      activityProxy.options ?? defaultActivityOptions
    )
    : proxyActivities<Record<string, (input: TemporalActivityInvocation) => Promise<Workflow.ResultEncoded<unknown, unknown>>>>(
      activityProxy?.options ?? defaultActivityOptions
    )

const makeRuntimeEngine = (
  state: TemporalWorkflowRuntimeState,
  activityCaller: Record<string, (input: TemporalActivityInvocation) => Promise<Workflow.ResultEncoded<unknown, unknown>>>
): WorkflowEngine.WorkflowEngine["Service"] =>
  WorkflowEngine.makeUnsafe({
    register: () => unsupported("Workflow registration is not available inside a Temporal workflow runtime"),
    execute: () => unsupported("Nested workflow execution is not implemented for the Temporal workflow runtime"),
    poll: () => unsupported("Workflow polling is not available inside a Temporal workflow runtime"),
    interrupt: () => Effect.sync(() => {
      state.interrupted = true
      state.resumed = false
      state.status = "suspended"
    }),
    interruptUnsafe: () => Effect.sync(() => {
      state.interrupted = true
      state.resumed = false
      state.status = "suspended"
    }),
    resume: () => Effect.sync(() => {
      state.interrupted = false
      state.resumed = true
      state.status = "running"
    }),
    activityExecute: Effect.fnUntraced(function*(activity, attempt) {
      const invoke = activityCaller[activity.name]
      if (invoke === undefined) {
        return yield* unsupported(`Temporal activity "${activity.name}" is not registered on the worker`)
      }
      const instance = yield* WorkflowEngine.WorkflowInstance
      const encoded = yield* Effect.tryPromise({
        try: () => invoke({
          executionId: instance.executionId,
          attempt
        }),
        catch: (cause) => new Error(`Temporal activity "${activity.name}" failed`, { cause })
      }).pipe(Effect.orDie)
      return decodeWorkflowResult(encoded) as Workflow.Result<unknown, unknown>
    }),
    deferredResult: (deferred) =>
      Effect.sync(() => {
        const exit = state.deferreds.get(deferred.name)
        return exit === undefined ? Option.none() : Option.some(exit)
      }),
    deferredDone: ({ deferredName, exit }) =>
      Effect.sync(() => {
        state.deferreds.set(deferredName, exit)
        if (!state.interrupted) {
          state.resumed = true
          state.status = "running"
        }
      }),
    scheduleClock: (_workflow, options) =>
      Effect.sync(() => {
        if (state.clocks.has(options.clock.name)) {
          return
        }
        const clock = {
          name: options.clock.name,
          durationMs: Duration.toMillis(options.clock.duration)
        } satisfies ScheduleClockSignal
        state.clocks.set(clock.name, clock)
        void sleep(clock.durationMs).then(() => {
          state.deferreds.set(options.clock.deferred.name, Exit.void)
          if (!state.interrupted) {
            state.resumed = true
            state.status = "running"
          }
        })
      })
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWorkflow = <Payload, Success, Error, R>(
  options: TemporalWorkflowRuntimeOptions<Payload, Success, Error, R>
): ((payload: Payload) => Promise<Success>) => {
  const activityCaller = makeActivityCaller(options.activityProxy)

  return async (payload) => {
    const executionId = executionIdFromWorkflowId(workflowInfo().workflowId)
    const state = makeRuntimeState(executionId)
    installBaseHandlers(state)

    while (true) {
      const instance = WorkflowEngine.WorkflowInstance.initial(options.workflow, executionId)
      instance.interrupted = state.interrupted
      const engine = makeRuntimeEngine(state, activityCaller)
      const base = options.execute(payload, executionId).pipe(
        Workflow.intoResult,
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
        Effect.provideService(WorkflowEngine.WorkflowInstance, instance)
      )
      const program = options.provide === undefined ? base : options.provide(base)
      const result = await Effect.runPromise(program as Effect.Effect<Workflow.Result<Success, Error>, never, never>)

      if (result._tag === "Complete") {
        state.status = "completed"
        state.result = encodeWorkflowResult(result) as unknown as Workflow.ResultEncoded<unknown, unknown>
        if (result.exit._tag === "Success") {
          return result.exit.value as Success
        }
        throw Cause.squash(result.exit.cause)
      }

      state.status = "suspended"
      state.suspendedCause = result.cause
      await waitForResume(state)
      state.suspendedCause = undefined
    }
  }
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeActivities = (
  workflow: Workflow.Any,
  activities: ReadonlyArray<Activity.Any>,
  options?: {
    readonly provide?: ((<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>)) | undefined
  } | undefined
): Record<string, (input: TemporalActivityInvocation) => Promise<Workflow.ResultEncoded<unknown, unknown>>> =>
  Object.fromEntries(
    activities.map((activity) => [
      activity.name,
      async ({ attempt, executionId }: TemporalActivityInvocation) => {
        const instance = WorkflowEngine.WorkflowInstance.initial(workflow, executionId)
        const base = activity.executeEncoded.pipe(
          Workflow.intoResult,
          Effect.provideService(WorkflowEngine.WorkflowInstance, instance),
          Effect.provideService(Activity.CurrentAttempt, attempt)
        )
        const program = options?.provide === undefined ? base : options.provide(base)
        return encodeWorkflowResult(
          await Effect.runPromise(program as Effect.Effect<Workflow.Result<any, any>, never, never>)
        ) as unknown as Workflow.ResultEncoded<unknown, unknown>
      }
    ])
  )
