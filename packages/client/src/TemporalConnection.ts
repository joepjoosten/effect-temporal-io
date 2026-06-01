/**
 * Effect service for Temporal client connections.
 *
 * @since 1.0.0
 */
import { Connection, type ConnectionOptions } from "@temporalio/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import { type TemporalConnectionError, tryConnectionPromise, tryConnectionSync } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalConnection {
  readonly unsafeConnection: Connection
  readonly ensureConnected: Effect.Effect<void, TemporalConnectionError>
  readonly close: Effect.Effect<void>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalConnection = Context.Service<TemporalConnection>(
  "@effect-temporal/client/TemporalConnection"
)

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalConnectionConfig = ConnectionOptions

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (connection: Connection): TemporalConnection =>
  TemporalConnection.of({
    unsafeConnection: connection,
    ensureConnected: tryConnectionPromise("Connection.ensureConnected", () => connection.ensureConnected()),
    close: Effect.promise(() => connection.close())
  })

const close = (connection: TemporalConnection): Effect.Effect<void> => connection.close.pipe(Effect.orDie)

/**
 * Creates a scoped eager Temporal connection.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalConnectionConfig = {}
): Effect.Effect<TemporalConnection, TemporalConnectionError, Scope.Scope> =>
  Effect.acquireRelease(
    tryConnectionPromise("Connection.connect", () => Connection.connect(options)).pipe(
      Effect.map(fromUnsafe)
    ),
    close
  )

/**
 * Creates a scoped lazy Temporal connection without verifying connectivity.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeLazy = (
  options: TemporalConnectionConfig = {}
): Effect.Effect<TemporalConnection, TemporalConnectionError, Scope.Scope> =>
  Effect.acquireRelease(
    tryConnectionSync("Connection.lazy", () => fromUnsafe(Connection.lazy(options))),
    close
  )

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  options: TemporalConnectionConfig = {}
): Layer.Layer<TemporalConnection, TemporalConnectionError> => Layer.effect(TemporalConnection)(make(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerLazy = (
  options: TemporalConnectionConfig = {}
): Layer.Layer<TemporalConnection, TemporalConnectionError> => Layer.effect(TemporalConnection)(makeLazy(options))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerFromUnsafe = (connection: Connection): Layer.Layer<TemporalConnection> =>
  Layer.succeed(TemporalConnection, fromUnsafe(connection))
