/**
 * Effect service for Temporal standalone activities and async completion.
 *
 * @since 1.0.0
 */
import {
  ActivityClient,
  type ActivityClientOptions,
  type ActivityExecutionInfo,
  type ActivityName,
  type ActivityOptions,
  type ActivityOptionsFor,
  type ActivityResult,
  type CountActivityExecutions,
  type FullActivityId
} from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as TemporalActivityHandle from "./TemporalActivityHandle.js"
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

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalActivityClientConfig = Omit<ActivityClientOptions, "connection">

/**
 * @since 1.0.0
 * @category Models
 */
export type ActivityOptionsWithArgs<Args extends TemporalSchema.Args> = Omit<ActivityOptions, "args"> & {
  readonly args?: TemporalSchema.Encoded<Args> | undefined
}

/**
 * Options accepted by newer Temporal SDK async-completion operations.
 *
 * @since 1.0.0
 * @category Models
 */
export interface TemporalAsyncCompletionOperationOptions {
  readonly serializationContext?: unknown
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalTypedActivityClient<T> {
  readonly start: <N extends ActivityName<T>>(
    activity: N,
    options: ActivityOptionsFor<T, N>
  ) => Effect.Effect<TemporalActivityHandle.TemporalActivityHandle<ActivityResult<T, N>>, TemporalClientError>
  readonly execute: <N extends ActivityName<T>>(
    activity: N,
    options: ActivityOptionsFor<T, N>
  ) => Effect.Effect<ActivityResult<T, N>, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalActivityClient {
  readonly unsafeClient: ActivityClient
  readonly typed: <T>() => TemporalTypedActivityClient<T>
  readonly start: <R = unknown>(
    activity: string,
    options: ActivityOptions
  ) => Effect.Effect<TemporalActivityHandle.TemporalActivityHandle<R>, TemporalClientError>
  readonly startWithSchema: <Args extends TemporalSchema.Args, R = unknown>(
    activity: string,
    options: ActivityOptionsWithArgs<Args>,
    schema: TemporalSchema.ArgsSchema<Args>
  ) => Effect.Effect<
    TemporalActivityHandle.TemporalActivityHandle<R>,
    TemporalClientError | TemporalValidationError,
    TemporalSchema.DecodingServices<Args>
  >
  readonly execute: <R = unknown>(
    activity: string,
    options: ActivityOptions
  ) => Effect.Effect<R, TemporalClientError>
  readonly executeWithSchema: <Args extends TemporalSchema.Args, Result extends TemporalSchema.Any>(
    activity: string,
    options: ActivityOptionsWithArgs<Args>,
    schema: TemporalSchema.ArgsAndResultSchema<Args, Result>
  ) => Effect.Effect<
    TemporalSchema.Type<Result>,
    TemporalClientError | TemporalValidationError,
    TemporalSchema.DecodingServices<Args> | TemporalSchema.DecodingServices<Result>
  >
  readonly getHandle: <R = unknown>(
    activityId: string,
    runId?: string | undefined
  ) => TemporalActivityHandle.TemporalActivityHandle<R>
  readonly list: (query: string) => Stream.Stream<ActivityExecutionInfo, TemporalClientError>
  readonly count: (query: string) => Effect.Effect<CountActivityExecutions, TemporalClientError>
  readonly complete: (
    taskTokenOrActivityId: Uint8Array | FullActivityId,
    result: unknown,
    options?: TemporalAsyncCompletionOperationOptions | undefined
  ) => Effect.Effect<void, TemporalClientError>
  readonly fail: (
    taskTokenOrActivityId: Uint8Array | FullActivityId,
    error: unknown,
    options?: TemporalAsyncCompletionOperationOptions | undefined
  ) => Effect.Effect<void, TemporalClientError>
  readonly reportCancellation: (
    taskTokenOrActivityId: Uint8Array | FullActivityId,
    details?: unknown,
    options?: TemporalAsyncCompletionOperationOptions | undefined
  ) => Effect.Effect<void, TemporalClientError>
  readonly heartbeat: (
    taskTokenOrActivityId: Uint8Array | FullActivityId,
    details?: unknown,
    options?: TemporalAsyncCompletionOperationOptions | undefined
  ) => Effect.Effect<void, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalActivityClient = Context.Service<TemporalActivityClient>(
  "@effect-temporal/client/TemporalActivityClient"
)

const makeTyped = <T>(client: ActivityClient): TemporalTypedActivityClient<T> => {
  const typed = client.typed<T>()
  return {
    start: (activity, options) =>
      tryClientPromise("ActivityClient.typed.start", () => typed.start(activity, options)).pipe(
        Effect.map(TemporalActivityHandle.fromUnsafe)
      ),
    execute: (activity, options) =>
      tryClientPromise("ActivityClient.typed.execute", () => typed.execute(activity, options))
  }
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: ActivityClient): TemporalActivityClient =>
  TemporalActivityClient.of({
    unsafeClient: client,
    typed: <T>() => makeTyped<T>(client),
    start: (activity, options) =>
      tryClientPromise("ActivityClient.start", () => client.start(activity, options)).pipe(
        Effect.map(TemporalActivityHandle.fromUnsafe)
      ),
    startWithSchema: (activity, options, schema) =>
      TemporalSchema.decodeInput("ActivityClient.start.args", schema.args, options.args ?? []).pipe(
        Effect.flatMap((args) =>
          tryClientPromise(
            "ActivityClient.start",
            () => client.start(activity, { ...options, args } as ActivityOptions)
          )
        ),
        Effect.map(TemporalActivityHandle.fromUnsafe)
      ),
    execute: (activity, options) => tryClientPromise("ActivityClient.execute", () => client.execute(activity, options)),
    executeWithSchema: (activity, options, schema) =>
      TemporalSchema.decodeInput("ActivityClient.execute.args", schema.args, options.args ?? []).pipe(
        Effect.flatMap((args) =>
          tryClientPromise(
            "ActivityClient.execute",
            () => client.execute(activity, { ...options, args } as ActivityOptions)
          )
        ),
        Effect.flatMap((value) => TemporalSchema.decodeOutput("ActivityClient.execute.result", schema.result, value))
      ),
    getHandle: (activityId, runId) => TemporalActivityHandle.fromUnsafe(client.getHandle(activityId, runId)),
    list: (query) => streamClientIterable("ActivityClient.list", client.list(query)),
    count: (query) => tryClientPromise("ActivityClient.count", () => client.count(query)),
    complete: (taskTokenOrActivityId, result, options) =>
      tryClientPromise(
        "ActivityClient.complete",
        () =>
          (client.complete as (...args: ReadonlyArray<any>) => Promise<void>)(taskTokenOrActivityId, result, options)
      ),
    fail: (taskTokenOrActivityId, error, options) =>
      tryClientPromise(
        "ActivityClient.fail",
        () => (client.fail as (...args: ReadonlyArray<any>) => Promise<void>)(taskTokenOrActivityId, error, options)
      ),
    reportCancellation: (taskTokenOrActivityId, details, options) =>
      tryClientPromise("ActivityClient.reportCancellation", () =>
        (client.reportCancellation as (...args: ReadonlyArray<any>) => Promise<void>)(
          taskTokenOrActivityId,
          details,
          options
        )),
    heartbeat: (taskTokenOrActivityId, details, options) =>
      tryClientPromise("ActivityClient.heartbeat", () =>
        (client.heartbeat as (...args: ReadonlyArray<any>) => Promise<void>)(taskTokenOrActivityId, details, options))
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalActivityClientConfig = {}
): Effect.Effect<TemporalActivityClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    return yield* tryClientSync(
      "ActivityClient.constructor",
      () => fromUnsafe(new ActivityClient({ ...options, connection: connection.unsafeConnection }))
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalActivityClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalActivityClient,
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
  options: TemporalActivityClientConfig = {}
): Layer.Layer<TemporalActivityClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalActivityClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalActivityClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalActivityClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalActivityClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: ActivityClient): Layer.Layer<TemporalActivityClient> =>
  Layer.succeed(TemporalActivityClient, fromUnsafe(client))
