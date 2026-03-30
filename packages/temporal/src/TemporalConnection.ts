/**
 * @since 1.0.0
 */
import {
  Connection,
  type ConnectionOptions
} from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import type * as Scope from "effect/Scope"
import { TemporalConnectionError } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalConnection extends Connection {}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalConnection = ServiceMap.Service<TemporalConnection>(
  "@effect-temporal/workflow/TemporalConnection"
)

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalConnectionConfig extends ConnectionOptions {}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: TemporalConnectionConfig = {}
): Effect.Effect<TemporalConnection, TemporalConnectionError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => Connection.connect(options),
      catch: (cause) =>
        new TemporalConnectionError({
          message: "Failed to connect to Temporal",
          cause
        })
    }),
    (connection) => Effect.promise(() => connection.close()).pipe(Effect.orDie)
  )

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  options: TemporalConnectionConfig = {}
): Layer.Layer<TemporalConnection, TemporalConnectionError> =>
  Layer.effect(TemporalConnection)(make(options))
