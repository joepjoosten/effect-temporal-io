/**
 * @since 1.0.0
 */
import {
  type Workflow,
  WorkflowClient,
  type WorkflowExecutionDescription,
  WorkflowFailedError,
  type WorkflowHandle,
  type WorkflowResultType,
  type WorkflowStartOptions
} from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as ServiceMap from "effect/ServiceMap"
import type * as Scope from "effect/Scope"
import * as TemporalConnection from "./TemporalConnection.js"
import { TemporalRequestError } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export class WorkflowExecution extends Schema.Class<WorkflowExecution>("WorkflowExecution")({
  workflowId: Schema.String,
  runId: Schema.optional(Schema.String)
}) {}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowClient {
  readonly unsafeClient: WorkflowClient
  readonly start: <T extends Workflow>(
    workflow: string | T,
    options: WorkflowStartOptions<T>
  ) => Effect.Effect<WorkflowHandle<T>, TemporalRequestError>
  readonly execute: <T extends Workflow>(
    workflow: string | T,
    options: WorkflowStartOptions<T>
  ) => Effect.Effect<WorkflowResultType<T>, TemporalRequestError>
  readonly describe: (
    execution: WorkflowExecution
  ) => Effect.Effect<WorkflowExecutionDescription, TemporalRequestError>
  readonly result: <T extends Workflow>(
    execution: WorkflowExecution,
    followRuns?: boolean | undefined
  ) => Effect.Effect<WorkflowResultType<T>, TemporalRequestError>
  readonly cancel: (
    execution: WorkflowExecution
  ) => Effect.Effect<void, TemporalRequestError>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalWorkflowClient = ServiceMap.Service<TemporalWorkflowClient>(
  "@effect-temporal/workflow/TemporalWorkflowClient"
)

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalWorkflowClientConfig = ConstructorParameters<typeof WorkflowClient>[0]

const wrap = <A>(
  message: string,
  thunk: () => Promise<A>
): Effect.Effect<A, TemporalRequestError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new TemporalRequestError({
        message,
        cause
      })
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: Omit<TemporalWorkflowClientConfig, "connection"> = {}
): Effect.Effect<TemporalWorkflowClient, never, TemporalConnection.TemporalConnection | Scope.Scope> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    const client = new WorkflowClient({
      ...options,
      connection
    })

    return TemporalWorkflowClient.of({
      unsafeClient: client,
      start: (workflow, startOptions) =>
        wrap("Failed to start workflow", () => client.start(workflow, startOptions)),
      execute: (workflow, startOptions) =>
        wrap("Failed to execute workflow", () => client.execute(workflow, startOptions)),
      describe: ({ workflowId, runId }) =>
        wrap("Failed to describe workflow", () => client.getHandle(workflowId, runId).describe()),
      result: ({ workflowId, runId }, followRuns) =>
        wrap(
          "Failed to fetch workflow result",
          () => client.result(workflowId, runId, followRuns === undefined ? undefined : { followRuns })
        ),
      cancel: ({ workflowId, runId }) =>
        wrap("Failed to cancel workflow", async () => {
          await client.getHandle(workflowId, runId).cancel()
        })
    })
  })

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  options: Omit<TemporalWorkflowClientConfig, "connection"> = {}
): Layer.Layer<TemporalWorkflowClient, never, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalWorkflowClient)(make(options))

/**
 * @since 1.0.0
 * @category Refinements
 */
export const isWorkflowFailure = (error: unknown): error is WorkflowFailedError =>
  error instanceof WorkflowFailedError

/**
 * @since 1.0.0
 * @category Helpers
 */
export const runIdFromDescription = (
  description: WorkflowExecutionDescription
): Option.Option<string> => Option.fromNullishOr(description.runId)
