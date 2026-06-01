/**
 * Effect service for the high-level Temporal SDK client.
 *
 * @since 1.0.0
 */
import { Client, type ClientOptions } from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as TemporalActivityClient from "./TemporalActivityClient.js"
import * as TemporalConnection from "./TemporalConnection.js"
import * as TemporalDataConverter from "./TemporalDataConverter.js"
import { type TemporalClientError, tryClientSync } from "./TemporalError.js"
import * as TemporalNexusClient from "./TemporalNexusClient.js"
import * as TemporalScheduleClient from "./TemporalScheduleClient.js"
import * as TemporalTaskQueueClient from "./TemporalTaskQueueClient.js"
import * as TemporalWorkflowClient from "./TemporalWorkflowClient.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalClientConfig = Omit<ClientOptions, "connection">

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalClient {
  readonly unsafeClient: Client
  readonly workflowService: Client["workflowService"]
  readonly workflow: TemporalWorkflowClient.TemporalWorkflowClient
  readonly activity: TemporalActivityClient.TemporalActivityClient
  readonly schedule: TemporalScheduleClient.TemporalScheduleClient
  readonly taskQueue: TemporalTaskQueueClient.TemporalTaskQueueClient
  readonly nexus?: TemporalNexusClient.TemporalNexusClient | undefined
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalClient = Context.Service<TemporalClient>(
  "@effect-temporal/client/TemporalClient"
)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: Client): TemporalClient => {
  const nexus = (client as unknown as { readonly nexus?: TemporalNexusClient.UnsafeNexusClient | undefined }).nexus
  return TemporalClient.of({
    unsafeClient: client,
    workflowService: client.workflowService,
    workflow: TemporalWorkflowClient.fromUnsafe(client.workflow),
    activity: TemporalActivityClient.fromUnsafe(client.activity),
    schedule: TemporalScheduleClient.fromUnsafe(client.schedule),
    taskQueue: TemporalTaskQueueClient.fromUnsafe(client.taskQueue),
    nexus: nexus === undefined ? undefined : TemporalNexusClient.fromUnsafe(nexus)
  })
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalClientConfig = {}
): Effect.Effect<TemporalClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    return yield* tryClientSync(
      "Client.constructor",
      () => fromUnsafe(new Client({ ...options, connection: connection.unsafeConnection }))
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalClient,
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
  options: TemporalClientConfig = {}
): Layer.Layer<TemporalClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: Client): Layer.Layer<TemporalClient> =>
  Layer.succeed(TemporalClient, fromUnsafe(client))
