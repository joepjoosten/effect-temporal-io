/**
 * @since 1.0.0
 */
import { type WorkflowFailedError, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as ServiceMap from "effect/ServiceMap"
import { type DurableClock } from "effect/unstable/workflow/DurableClock"
import type * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import * as TemporalClient from "./TemporalClient.js"
import { TemporalRequestError, TemporalWorkflowEngineError } from "./TemporalError.js"
import type { CompleteDeferredSignal, ScheduleClockSignal, TemporalDeferredResult, TemporalWorkflowState } from "./TemporalWorkflowProtocol.js"
import {
  completeDeferredSignalName,
  deferredResultQueryName,
  interruptSignalName,
  resumeSignalName,
  scheduleClockSignalName,
  workflowIdFor,
  workflowStateQueryName
} from "./TemporalWorkflowProtocol.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowEngineConfig {
  readonly taskQueue: string
  readonly workflowIdPrefix?: string | undefined
  readonly followRuns?: boolean | undefined
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalWorkflowRegistry = ServiceMap.Service<
  TemporalWorkflowRegistry,
  Map<string, Workflow.Any>
>("@effect-temporal/workflow/TemporalWorkflowRegistry")

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowRegistry extends Map<string, Workflow.Any> {}

const unsupported = (message: string): Effect.Effect<never, never> =>
  Effect.die(
    new TemporalWorkflowEngineError({
      message
    })
  )

const exitFromFailure = (error: WorkflowFailedError | unknown): Exit.Exit<never, unknown> => {
  if (typeof error === "object" && error !== null && "cause" in error) {
    return Exit.fail((error as { cause: unknown }).cause)
  }
  return Exit.fail(error)
}

const completed = <A, E>(exit: Exit.Exit<A, E>): Workflow.Result<A, E> =>
  new Workflow.Complete({ exit })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  config: TemporalWorkflowEngineConfig
): Effect.Effect<
  WorkflowEngine.WorkflowEngine["Service"],
  never,
  TemporalClient.TemporalWorkflowClient
> =>
  Effect.gen(function*() {
    const client = yield* TemporalClient.TemporalWorkflowClient
    const registry = yield* Ref.make(new Map<string, Workflow.Any>())

    const engine = WorkflowEngine.makeUnsafe({
      register: (workflow: Workflow.Any) =>
        Ref.update(registry, (current) => new Map(current).set(workflow.name, workflow)),
      execute: (workflow: Workflow.Any, options: any) =>
        Effect.gen(function*() {
          const workflowId = workflowIdFor(workflow.name, options.executionId, config.workflowIdPrefix)
          try {
            const handle = yield* client.start(workflow.name, {
              workflowId,
              taskQueue: config.taskQueue,
              args: [options.payload]
            })
            if (options.discard) {
              return undefined as void
            }
            const result = yield* Effect.tryPromise({
              try: () => handle.result(),
              catch: (cause) =>
                new TemporalRequestError({
                  message: "Failed while awaiting workflow completion",
                  cause
                })
            })
            return completed(Exit.succeed(result))
          } catch (error) {
            if (error instanceof WorkflowExecutionAlreadyStartedError) {
              if (options.discard) {
                return undefined as void
              }
              const result = yield* client.result({ workflowId }, config.followRuns)
              return completed(Exit.succeed(result))
            }
            return yield* Effect.die(error)
          }
        }) as any,
      poll: (workflow: Workflow.Any, executionId: string) =>
        Effect.gen(function*() {
          const workflowId = workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
          const description = yield* client.describe({ workflowId }).pipe(
            Effect.catchTag("TemporalRequestError", () => Effect.succeed(null))
          )
          if (description === null) {
            return Option.none()
          }
          if (description.status.name === "RUNNING") {
            const state = yield* client.query<TemporalWorkflowState>(
              { workflowId },
              workflowStateQueryName
            ).pipe(Effect.catchTag("TemporalRequestError", () => Effect.succeed<TemporalWorkflowState | null>(null)))
            if (state?.status === "suspended") {
              return Option.some(new Workflow.Suspended({
                cause: undefined
              }))
            }
            return Option.none()
          }
          try {
            const result = yield* client.result({ workflowId }, config.followRuns)
            return Option.some(completed(Exit.succeed(result)))
          } catch (error) {
            return Option.some(completed(exitFromFailure(error)))
          }
        }) as any,
      interrupt: (workflow: Workflow.Any, executionId: string) =>
        client.signal(
          {
            workflowId: workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
          },
          interruptSignalName
        ).pipe(Effect.catchTag("TemporalRequestError", () => Effect.void)),
      resume: (workflow: Workflow.Any, executionId: string) =>
        client.signal(
          {
            workflowId: workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
          },
          resumeSignalName
        ).pipe(Effect.catchTag("TemporalRequestError", () => Effect.void)),
      activityExecute: () =>
        unsupported("Temporal activity execution bridge is not implemented yet"),
      deferredResult: (deferred: DurableDeferred.Any) =>
        Effect.gen(function*() {
          const instance = yield* WorkflowEngine.WorkflowInstance
          return yield* client.query<TemporalDeferredResult>(
            {
              workflowId: workflowIdFor(instance.workflow.name, instance.executionId, config.workflowIdPrefix)
            },
            deferredResultQueryName,
            deferred.name
          ).pipe(
            Effect.map((result) => result.found ? Option.some(result.exit as Exit.Exit<unknown, unknown>) : Option.none()),
            Effect.catchTag("TemporalRequestError", () => Effect.succeed(Option.none()))
          )
        }),
      deferredDone: (_deferred: DurableDeferred.Any, options: any) =>
        client.signal(
          {
            workflowId: workflowIdFor(options.workflowName, options.executionId, config.workflowIdPrefix)
          },
          completeDeferredSignalName,
          {
            name: options.deferredName,
            exit: options.exit
          } satisfies CompleteDeferredSignal
        ).pipe(Effect.catchTag("TemporalRequestError", () => Effect.void)),
      scheduleClock: (workflow: Workflow.Any, options: { readonly executionId: string; readonly clock: DurableClock }) =>
        client.signal(
          {
            workflowId: workflowIdFor(workflow.name, options.executionId, config.workflowIdPrefix)
          },
          scheduleClockSignalName,
          {
            name: options.clock.name,
            durationMs: Duration.toMillis(options.clock.duration)
          } satisfies ScheduleClockSignal
        ).pipe(Effect.catchTag("TemporalRequestError", () => Effect.void))
    } as any) as WorkflowEngine.WorkflowEngine["Service"]

    return engine
  })

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  config: TemporalWorkflowEngineConfig
): Layer.Layer<WorkflowEngine.WorkflowEngine, never, TemporalClient.TemporalWorkflowClient> =>
  Layer.effect(WorkflowEngine.WorkflowEngine)(make(config) as any)
