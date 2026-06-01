/**
 * Effect service for Temporal workflow operations.
 *
 * @since 1.0.0
 */
import {
  type CountWorkflowExecution,
  type GetWorkflowHandleOptions,
  type IntoHistoriesOptions,
  type ListOptions,
  type UpdateDefinition,
  WithStartWorkflowOperation,
  type WithWorkflowArgs,
  type Workflow,
  WorkflowClient,
  type WorkflowClientOptions,
  type WorkflowExecutionInfo,
  type WorkflowIdConflictPolicy,
  type WorkflowResultOptions,
  type WorkflowResultType,
  type WorkflowSignalWithStartOptions,
  type WorkflowStartOptions,
  type WorkflowUpdateOptions
} from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as TemporalConnection from "./TemporalConnection.js"
import * as TemporalDataConverter from "./TemporalDataConverter.js"
import {
  streamClientIterable,
  type TemporalClientError,
  type TemporalValidationError,
  tryClientPromise,
  tryClientSync
} from "./TemporalError.js"
import * as TemporalSchema from "./TemporalSchema.js"
import * as TemporalWorkflowHandle from "./TemporalWorkflowHandle.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalWorkflowClientConfig = Omit<WorkflowClientOptions, "connection">

/**
 * @since 1.0.0
 * @category Models
 */
export type WorkflowHistoryEntry = ReturnType<
  ReturnType<WorkflowClient["list"]>["intoHistories"]
> extends AsyncIterable<infer A> ? A : never

/**
 * @since 1.0.0
 * @category Models
 */
export type WorkflowStartOptionsWithArgs<T extends Workflow, Args extends TemporalSchema.Args> =
  & Omit<
    WorkflowStartOptions<T>,
    "args"
  >
  & {
    readonly args?: TemporalSchema.Encoded<Args> | undefined
  }

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowClient {
  readonly unsafeClient: WorkflowClient
  readonly start: <T extends Workflow>(
    workflow: string | T,
    options: WorkflowStartOptions<T>
  ) => Effect.Effect<TemporalWorkflowHandle.TemporalWorkflowHandle<T>, TemporalClientError>
  readonly startWithSchema: <T extends Workflow, Args extends TemporalSchema.Args>(
    workflow: string | T,
    options: WorkflowStartOptionsWithArgs<T, Args>,
    schema: TemporalSchema.ArgsSchema<Args>
  ) => Effect.Effect<
    TemporalWorkflowHandle.TemporalWorkflowHandle<T>,
    TemporalClientError | TemporalValidationError,
    TemporalSchema.DecodingServices<Args>
  >
  readonly signalWithStart: <T extends Workflow, SignalArgs extends any[] = []>(
    workflow: string | T,
    options: WithWorkflowArgs<T, WorkflowSignalWithStartOptions<SignalArgs>>
  ) => Effect.Effect<TemporalWorkflowHandle.TemporalWorkflowHandle<T>, TemporalClientError>
  readonly execute: <T extends Workflow>(
    workflow: string | T,
    options: WorkflowStartOptions<T>
  ) => Effect.Effect<WorkflowResultType<T>, TemporalClientError>
  readonly executeWithSchema: <
    T extends Workflow,
    Args extends TemporalSchema.Args,
    Result extends TemporalSchema.Any
  >(
    workflow: string | T,
    options: WorkflowStartOptionsWithArgs<T, Args>,
    schema: TemporalSchema.ArgsAndResultSchema<Args, Result>
  ) => Effect.Effect<
    TemporalSchema.Type<Result>,
    TemporalClientError | TemporalValidationError,
    TemporalSchema.DecodingServices<Args> | TemporalSchema.DecodingServices<Result>
  >
  readonly result: <T extends Workflow>(
    workflowId: string,
    runId?: string | undefined,
    options?: WorkflowResultOptions | undefined
  ) => Effect.Effect<WorkflowResultType<T>, TemporalClientError>
  readonly resultAs: <Result extends TemporalSchema.Any>(
    workflowId: string,
    schema: TemporalSchema.ResultSchema<Result>,
    runId?: string | undefined,
    options?: WorkflowResultOptions | undefined
  ) => Effect.Effect<
    TemporalSchema.Type<Result>,
    TemporalClientError | TemporalValidationError,
    TemporalSchema.DecodingServices<Result>
  >
  readonly getHandle: <T extends Workflow>(
    workflowId: string,
    runId?: string | undefined,
    options?: GetWorkflowHandleOptions | undefined
  ) => TemporalWorkflowHandle.TemporalWorkflowHandle<T>
  readonly list: (
    options?: ListOptions | undefined
  ) => Stream.Stream<WorkflowExecutionInfo, TemporalClientError>
  readonly listHistories: (
    options?: ListOptions | undefined,
    intoHistoriesOptions?: IntoHistoriesOptions | undefined
  ) => Stream.Stream<WorkflowHistoryEntry, TemporalClientError>
  readonly count: (query?: string | undefined) => Effect.Effect<CountWorkflowExecution, TemporalClientError>
  readonly startUpdateWithStart: <T extends Workflow, Ret, Args extends any[]>(
    definition: UpdateDefinition<Ret, Args> | string,
    options: WorkflowUpdateOptions & {
      readonly args?: Args | undefined
      readonly waitForStage: "ACCEPTED"
      readonly startWorkflowOperation: WithStartWorkflowOperation<T>
    }
  ) => Effect.Effect<TemporalWorkflowHandle.TemporalWorkflowUpdateHandle<Ret>, TemporalClientError>
  readonly executeUpdateWithStart: <T extends Workflow, Ret, Args extends any[]>(
    definition: UpdateDefinition<Ret, Args> | string,
    options: WorkflowUpdateOptions & {
      readonly args?: Args | undefined
      readonly startWorkflowOperation: WithStartWorkflowOperation<T>
    }
  ) => Effect.Effect<Ret, TemporalClientError>
  readonly withStartWorkflowOperation: <T extends Workflow>(
    workflow: string | T,
    options: WorkflowStartOptions<T> & { readonly workflowIdConflictPolicy: WorkflowIdConflictPolicy }
  ) => WithStartWorkflowOperation<T>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalWorkflowClient = Context.Service<TemporalWorkflowClient>(
  "@effect-temporal/client/TemporalWorkflowClient"
)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: WorkflowClient): TemporalWorkflowClient =>
  TemporalWorkflowClient.of({
    unsafeClient: client,
    start: (workflow, options) =>
      tryClientPromise("WorkflowClient.start", () => client.start(workflow, options)).pipe(
        Effect.map(TemporalWorkflowHandle.fromUnsafe)
      ),
    startWithSchema: (workflow, options, schema) =>
      TemporalSchema.decodeInput("WorkflowClient.start.args", schema.args, options.args ?? []).pipe(
        Effect.flatMap((args) =>
          tryClientPromise("WorkflowClient.start", () =>
            client.start(workflow, { ...options, args } as WorkflowStartOptions<any>))
        ),
        Effect.map(TemporalWorkflowHandle.fromUnsafe)
      ),
    signalWithStart: (workflow, options) =>
      tryClientPromise("WorkflowClient.signalWithStart", () =>
        client.signalWithStart(workflow, options)).pipe(
          Effect.map(TemporalWorkflowHandle.fromUnsafe)
        ),
    execute: (workflow, options) => tryClientPromise("WorkflowClient.execute", () => client.execute(workflow, options)),
    executeWithSchema: (workflow, options, schema) =>
      TemporalSchema.decodeInput("WorkflowClient.execute.args", schema.args, options.args ?? []).pipe(
        Effect.flatMap((args) =>
          tryClientPromise("WorkflowClient.execute", () =>
            client.execute(workflow, { ...options, args } as WorkflowStartOptions<any>))
        ),
        Effect.flatMap((value) =>
          TemporalSchema.decodeOutput("WorkflowClient.execute.result", schema.result, value)
        )
      ),
    result: (workflowId, runId, options) =>
      tryClientPromise("WorkflowClient.result", () => client.result(workflowId, runId, options)),
    resultAs: (workflowId, schema, runId, options) =>
      tryClientPromise("WorkflowClient.result", () => client.result(workflowId, runId, options)).pipe(
        Effect.flatMap((value) => TemporalSchema.decodeOutput("WorkflowClient.result", schema.result, value))
      ),
    getHandle: (workflowId, runId, options) =>
      TemporalWorkflowHandle.fromUnsafe(client.getHandle(workflowId, runId, options)),
    list: (options) => streamClientIterable("WorkflowClient.list", client.list(options)),
    listHistories: (options, intoHistoriesOptions) =>
      streamClientIterable(
        "WorkflowClient.list.intoHistories",
        client.list(options).intoHistories(intoHistoriesOptions)
      ),
    count: (query) => tryClientPromise("WorkflowClient.count", () => client.count(query)),
    startUpdateWithStart: (definition, options) =>
      tryClientPromise("WorkflowClient.startUpdateWithStart", () =>
        client.startUpdateWithStart(definition, options as any)).pipe(
          Effect.map(TemporalWorkflowHandle.fromUnsafeUpdateHandle)
        ),
    executeUpdateWithStart: (definition, options) =>
      tryClientPromise("WorkflowClient.executeUpdateWithStart", () =>
        client.executeUpdateWithStart(definition, options as any)),
    withStartWorkflowOperation: (workflow, options) =>
      new WithStartWorkflowOperation(workflow, options)
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalWorkflowClientConfig = {}
): Effect.Effect<TemporalWorkflowClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    return yield* tryClientSync(
      "WorkflowClient.constructor",
      () => fromUnsafe(new WorkflowClient({ ...options, connection: connection.unsafeConnection }))
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalWorkflowClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalWorkflowClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> =>
  Effect.gen(function*() {
    const dataConverter = yield* TemporalDataConverter.TemporalDataConverter
    return yield* make({ ...options, dataConverter })
  })

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  options: TemporalWorkflowClientConfig = {}
): Layer.Layer<TemporalWorkflowClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalWorkflowClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalWorkflowClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalWorkflowClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalWorkflowClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: WorkflowClient): Layer.Layer<TemporalWorkflowClient> =>
  Layer.succeed(TemporalWorkflowClient, fromUnsafe(client))
