/**
 * @since 1.0.0
 */
import type * as TemporalClientError from "@effect-temporal/client/TemporalError"
import { WorkflowExecutionAlreadyStartedError, type WorkflowFailedError } from "@temporalio/client"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { type DurableClock } from "effect/unstable/workflow/DurableClock"
import type * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import * as TemporalClient from "./TemporalClient.js"
import { TemporalWorkflowEngineError } from "./TemporalError.js"
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
export const TemporalWorkflowRegistry = Context.Service<
  TemporalWorkflowRegistry,
  Map<string, Workflow.Any>
>("@effect-temporal/workflow/TemporalWorkflowRegistry")

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalWorkflowRegistry = Map<string, Workflow.Any>

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

const completed = <A, E>(exit: Exit.Exit<A, E>): Workflow.Result<A, E> => new Workflow.Complete({ exit })

const workflowResultOptions = (
  config: TemporalWorkflowEngineConfig
) => config.followRuns === undefined ? undefined : { followRuns: config.followRuns }

const completedFromResult = <A>(
  result: Effect.Effect<A, TemporalClientError.TemporalClientError>
): Effect.Effect<Workflow.Result<A, unknown>> =>
  result.pipe(
    Effect.match({
      onFailure: (error) => completed(exitFromFailure(error.cause)),
      onSuccess: (value) => completed(Exit.succeed(value))
    })
  )

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
          const start = client.start(workflow.name, {
            workflowId,
            taskQueue: config.taskQueue,
            args: [options.payload]
          }).pipe(
            Effect.catchTag("TemporalClientError", (error) => {
              if (error.cause instanceof WorkflowExecutionAlreadyStartedError) {
                return Effect.succeed(null)
              }
              return Effect.die(error)
            })
          )
          const handle = yield* start
          if (options.discard) {
            return undefined as void
          }
          if (handle === null) {
            return yield* completedFromResult(
              client.result(workflowId, undefined, workflowResultOptions(config))
            )
          }
          return yield* completedFromResult(handle.result)
        }) as any,
      poll: (workflow: Workflow.Any, executionId: string) =>
        Effect.gen(function*() {
          const workflowId = workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
          const handle = client.getHandle(workflowId)
          const description = yield* handle.describe.pipe(
            Effect.catchTag("TemporalClientError", () => Effect.succeed(null))
          )
          if (description === null) {
            return Option.none()
          }
          if (description.status.name === "RUNNING") {
            const state = yield* handle.query<TemporalWorkflowState>(
              workflowStateQueryName
            ).pipe(Effect.catchTag("TemporalClientError", () => Effect.succeed<TemporalWorkflowState | null>(null)))
            if (state?.status === "suspended") {
              return Option.some(
                new Workflow.Suspended({
                  cause: undefined
                })
              )
            }
            return Option.none()
          }
          const result = yield* completedFromResult(
            client.result(workflowId, undefined, workflowResultOptions(config))
          )
          return Option.some(result)
        }) as any,
      interrupt: (workflow: Workflow.Any, executionId: string) =>
        client.getHandle(
          workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
        ).signal(interruptSignalName).pipe(Effect.catchTag("TemporalClientError", () => Effect.void)),
      interruptUnsafe: (workflow: Workflow.Any, executionId: string) =>
        client.getHandle(
          workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
        ).signal(interruptSignalName).pipe(Effect.catchTag("TemporalClientError", () => Effect.void)),
      resume: (workflow: Workflow.Any, executionId: string) =>
        client.getHandle(
          workflowIdFor(workflow.name, executionId, config.workflowIdPrefix)
        ).signal(resumeSignalName).pipe(Effect.catchTag("TemporalClientError", () => Effect.void)),
      activityExecute: () =>
        unsupported(
          "Temporal activity execution is available from TemporalWorkflowRuntime.makeWorkflow, not the client-side engine"
        ),
      deferredResult: (deferred: DurableDeferred.Any) =>
        Effect.gen(function*() {
          const instance = yield* WorkflowEngine.WorkflowInstance
          return yield* client.getHandle(
            workflowIdFor(instance.workflow.name, instance.executionId, config.workflowIdPrefix)
          ).query<TemporalDeferredResult, [string]>(
            deferredResultQueryName,
            deferred.name
          ).pipe(
            Effect.map((result) =>
              result.found ? Option.some(result.exit as Exit.Exit<unknown, unknown>) : Option.none()
            ),
            Effect.catchTag("TemporalClientError", () => Effect.succeed(Option.none()))
          )
        }),
      deferredDone: (options: any) =>
        client.getHandle(
          workflowIdFor(options.workflowName, options.executionId, config.workflowIdPrefix)
        ).signal(
          completeDeferredSignalName,
          {
            name: options.deferredName,
            exit: options.exit
          } satisfies CompleteDeferredSignal
        ).pipe(Effect.catchTag("TemporalClientError", () => Effect.void)),
      scheduleClock: (
        workflow: Workflow.Any,
        options: { readonly executionId: string; readonly clock: DurableClock }
      ) =>
        client.getHandle(
          workflowIdFor(workflow.name, options.executionId, config.workflowIdPrefix)
        ).signal(
          scheduleClockSignalName,
          {
            name: options.clock.name,
            durationMs: Duration.toMillis(options.clock.duration)
          } satisfies ScheduleClockSignal
        ).pipe(Effect.catchTag("TemporalClientError", () => Effect.void))
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
