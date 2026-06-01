/**
 * Effect service for Temporal task queue operations.
 *
 * @since 1.0.0
 */
import {
  type BuildIdOperation,
  type ReachabilityOptions,
  type ReachabilityResponse,
  TaskQueueClient,
  type TaskQueueClientOptions,
  type WorkerBuildIdVersionSets
} from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as TemporalConnection from "./TemporalConnection.js"
import * as TemporalDataConverter from "./TemporalDataConverter.js"
import { type TemporalClientError, tryClientPromise, tryClientSync } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalTaskQueueClientConfig = Omit<TaskQueueClientOptions, "connection">

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalTaskQueueClient {
  readonly unsafeClient: TaskQueueClient
  readonly updateBuildIdCompatibility: (
    taskQueue: string,
    operation: BuildIdOperation
  ) => Effect.Effect<void, TemporalClientError>
  readonly getBuildIdCompatability: (
    taskQueue: string
  ) => Effect.Effect<WorkerBuildIdVersionSets | undefined, TemporalClientError>
  readonly getReachability: (options: ReachabilityOptions) => Effect.Effect<ReachabilityResponse, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalTaskQueueClient = Context.Service<TemporalTaskQueueClient>(
  "@effect-temporal/client/TemporalTaskQueueClient"
)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: TaskQueueClient): TemporalTaskQueueClient =>
  TemporalTaskQueueClient.of({
    unsafeClient: client,
    updateBuildIdCompatibility: (taskQueue, operation) =>
      tryClientPromise(
        "TaskQueueClient.updateBuildIdCompatibility",
        () => client.updateBuildIdCompatibility(taskQueue, operation)
      ),
    getBuildIdCompatability: (taskQueue) =>
      tryClientPromise("TaskQueueClient.getBuildIdCompatability", () => client.getBuildIdCompatability(taskQueue)),
    getReachability: (options) =>
      tryClientPromise("TaskQueueClient.getReachability", () => client.getReachability(options))
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalTaskQueueClientConfig = {}
): Effect.Effect<TemporalTaskQueueClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    return yield* tryClientSync(
      "TaskQueueClient.constructor",
      () => fromUnsafe(new TaskQueueClient({ ...options, connection: connection.unsafeConnection }))
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalTaskQueueClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalTaskQueueClient,
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
  options: TemporalTaskQueueClientConfig = {}
): Layer.Layer<TemporalTaskQueueClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalTaskQueueClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalTaskQueueClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalTaskQueueClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalTaskQueueClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: TaskQueueClient): Layer.Layer<TemporalTaskQueueClient> =>
  Layer.succeed(TemporalTaskQueueClient, fromUnsafe(client))
