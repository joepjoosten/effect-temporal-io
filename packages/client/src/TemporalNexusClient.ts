/**
 * Effect service for Temporal Nexus standalone operations.
 *
 * The local Temporal SDK source tree has Nexus support that is not present in
 * every published `@temporalio/client` build. This module uses structural
 * types and dynamic construction so the package still typechecks against the
 * published SDK while supporting local SDK builds that expose Nexus.
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import type * as NexusRpc from "nexus-rpc"
import * as TemporalConnection from "./TemporalConnection.js"
import * as TemporalDataConverter from "./TemporalDataConverter.js"
import { makeClientError, streamClientIterable, type TemporalClientError, tryClientPromise } from "./TemporalError.js"
import * as TemporalNexusHandle from "./TemporalNexusHandle.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalNexusClientConfig = Record<string, unknown>

/**
 * @since 1.0.0
 * @category Models
 */
export type GetNexusOperationHandleOptions = {
  readonly runId?: string | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export type ListNexusOperationsOptions = {
  readonly query?: string | undefined
  readonly pageSize?: number | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export type StartNexusOperationOptions = Record<string, unknown>

/**
 * @since 1.0.0
 * @category Models
 */
export type NexusOperationExecution = unknown

/**
 * @since 1.0.0
 * @category Models
 */
export type NexusOperationExecutionCount = unknown

/**
 * @since 1.0.0
 * @category Models
 */
export interface UnsafeNexusServiceClient<T extends NexusRpc.ServiceDefinition> {
  readonly endpoint: string
  readonly service: T
  readonly startOperation: <Op extends T["operations"][keyof T["operations"]]>(
    operation: Op,
    input: NexusRpc.OperationInput<Op>,
    options: StartNexusOperationOptions
  ) => Promise<TemporalNexusHandle.UnsafeNexusOperationHandle<NexusRpc.OperationOutput<Op>>>
  readonly executeOperation: <Op extends T["operations"][keyof T["operations"]]>(
    operation: Op,
    input: NexusRpc.OperationInput<Op>,
    options: StartNexusOperationOptions
  ) => Promise<NexusRpc.OperationOutput<Op>>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface UnsafeNexusClient {
  readonly createServiceClient: <T extends NexusRpc.ServiceDefinition>(options: {
    readonly endpoint: string
    readonly service: T
  }) => UnsafeNexusServiceClient<T>
  readonly getHandle: <O = unknown>(
    operationId: string,
    options?: GetNexusOperationHandleOptions | undefined
  ) => TemporalNexusHandle.UnsafeNexusOperationHandle<O>
  readonly list: (options?: ListNexusOperationsOptions | undefined) => AsyncIterable<NexusOperationExecution>
  readonly count: (query?: string | undefined) => Promise<NexusOperationExecutionCount>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalNexusServiceClient<T extends NexusRpc.ServiceDefinition> {
  readonly unsafeServiceClient: UnsafeNexusServiceClient<T>
  readonly endpoint: string
  readonly service: T
  readonly startOperation: <Op extends T["operations"][keyof T["operations"]]>(
    operation: Op,
    input: NexusRpc.OperationInput<Op>,
    options: StartNexusOperationOptions
  ) => Effect.Effect<
    TemporalNexusHandle.TemporalNexusOperationHandle<NexusRpc.OperationOutput<Op>>,
    TemporalClientError
  >
  readonly executeOperation: <Op extends T["operations"][keyof T["operations"]]>(
    operation: Op,
    input: NexusRpc.OperationInput<Op>,
    options: StartNexusOperationOptions
  ) => Effect.Effect<NexusRpc.OperationOutput<Op>, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalNexusClient {
  readonly unsafeClient: UnsafeNexusClient
  readonly createServiceClient: <T extends NexusRpc.ServiceDefinition>(options: {
    readonly endpoint: string
    readonly service: T
  }) => TemporalNexusServiceClient<T>
  readonly getHandle: <O = unknown>(
    operationId: string,
    options?: GetNexusOperationHandleOptions | undefined
  ) => TemporalNexusHandle.TemporalNexusOperationHandle<O>
  readonly list: (
    options?: ListNexusOperationsOptions | undefined
  ) => Stream.Stream<NexusOperationExecution, TemporalClientError>
  readonly count: (query?: string | undefined) => Effect.Effect<NexusOperationExecutionCount, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalNexusClient = Context.Service<TemporalNexusClient>(
  "@effect-temporal/client/TemporalNexusClient"
)

const fromUnsafeServiceClient = <T extends NexusRpc.ServiceDefinition>(
  serviceClient: UnsafeNexusServiceClient<T>
): TemporalNexusServiceClient<T> => ({
  unsafeServiceClient: serviceClient,
  endpoint: serviceClient.endpoint,
  service: serviceClient.service,
  startOperation: (operation, input, options) =>
    tryClientPromise("NexusServiceClient.startOperation", () => serviceClient.startOperation(operation, input, options))
      .pipe(
        Effect.map(TemporalNexusHandle.fromUnsafe)
      ),
  executeOperation: (operation, input, options) =>
    tryClientPromise(
      "NexusServiceClient.executeOperation",
      () => serviceClient.executeOperation(operation, input, options)
    )
})

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: UnsafeNexusClient): TemporalNexusClient =>
  TemporalNexusClient.of({
    unsafeClient: client,
    createServiceClient: (options) => fromUnsafeServiceClient(client.createServiceClient(options)),
    getHandle: (operationId, options) => TemporalNexusHandle.fromUnsafe(client.getHandle(operationId, options)),
    list: (options) => streamClientIterable("NexusClient.list", client.list(options)),
    count: (query) => tryClientPromise("NexusClient.count", () => client.count(query))
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalNexusClientConfig = {}
): Effect.Effect<TemporalNexusClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    const module = yield* tryClientPromise("NexusClient.import", () => import("@temporalio/client"))
    const NexusClientConstructor = (module as Record<string, unknown>).NexusClient
    if (typeof NexusClientConstructor !== "function") {
      return yield* Effect.fail(
        makeClientError("NexusClient.constructor", "Temporal SDK client does not expose NexusClient")
      )
    }
    const Constructor = NexusClientConstructor as new(options: Record<string, unknown>) => UnsafeNexusClient
    return fromUnsafe(
      new Constructor({ ...options, connection: connection.unsafeConnection })
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalNexusClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalNexusClient,
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
  options: TemporalNexusClientConfig = {}
): Layer.Layer<TemporalNexusClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalNexusClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalNexusClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalNexusClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalNexusClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: UnsafeNexusClient): Layer.Layer<TemporalNexusClient> =>
  Layer.succeed(TemporalNexusClient, fromUnsafe(client))
