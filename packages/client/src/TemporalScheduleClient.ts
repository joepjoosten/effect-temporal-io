/**
 * Effect service for Temporal schedules.
 *
 * @since 1.0.0
 */
import {
  type ListScheduleOptions,
  ScheduleClient,
  type ScheduleClientOptions,
  type ScheduleOptions,
  type ScheduleOptionsAction,
  type ScheduleSummary
} from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as TemporalConnection from "./TemporalConnection.js"
import * as TemporalDataConverter from "./TemporalDataConverter.js"
import { streamClientIterable, type TemporalClientError, tryClientPromise, tryClientSync } from "./TemporalError.js"
import * as TemporalScheduleHandle from "./TemporalScheduleHandle.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalScheduleClientConfig = Omit<ScheduleClientOptions, "connection">

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalScheduleClient {
  readonly unsafeClient: ScheduleClient
  readonly create: <A extends ScheduleOptionsAction = ScheduleOptionsAction>(
    options: ScheduleOptions<A>
  ) => Effect.Effect<TemporalScheduleHandle.TemporalScheduleHandle, TemporalClientError>
  readonly list: (
    options?: ListScheduleOptions | undefined
  ) => Stream.Stream<ScheduleSummary, TemporalClientError>
  readonly getHandle: (scheduleId: string) => TemporalScheduleHandle.TemporalScheduleHandle
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalScheduleClient = Context.Service<TemporalScheduleClient>(
  "@effect-temporal/client/TemporalScheduleClient"
)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (client: ScheduleClient): TemporalScheduleClient =>
  TemporalScheduleClient.of({
    unsafeClient: client,
    create: (options: ScheduleOptions) =>
      tryClientPromise("ScheduleClient.create", () => client.create(options)).pipe(
        Effect.map(TemporalScheduleHandle.fromUnsafe)
      ),
    list: (options) => streamClientIterable("ScheduleClient.list", client.list(options)),
    getHandle: (scheduleId) => TemporalScheduleHandle.fromUnsafe(client.getHandle(scheduleId))
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalScheduleClientConfig = {}
): Effect.Effect<TemporalScheduleClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Effect.gen(function*() {
    const connection = yield* TemporalConnection.TemporalConnection
    return yield* tryClientSync(
      "ScheduleClient.constructor",
      () => fromUnsafe(new ScheduleClient({ ...options, connection: connection.unsafeConnection }))
    )
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithDataConverter = (
  options: Omit<TemporalScheduleClientConfig, "dataConverter"> = {}
): Effect.Effect<
  TemporalScheduleClient,
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
  options: TemporalScheduleClientConfig = {}
): Layer.Layer<TemporalScheduleClient, TemporalClientError, TemporalConnection.TemporalConnection> =>
  Layer.effect(TemporalScheduleClient)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithDataConverter = (
  options: Omit<TemporalScheduleClientConfig, "dataConverter"> = {}
): Layer.Layer<
  TemporalScheduleClient,
  TemporalClientError,
  TemporalConnection.TemporalConnection | TemporalDataConverter.TemporalDataConverter
> => Layer.effect(TemporalScheduleClient)(makeWithDataConverter(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (client: ScheduleClient): Layer.Layer<TemporalScheduleClient> =>
  Layer.succeed(TemporalScheduleClient, fromUnsafe(client))
