/**
 * @since 1.0.0
 */
import {
  NativeConnection,
  type NativeConnectionOptions,
  Worker,
  type WorkerOptions
} from "@temporalio/worker"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import type * as Scope from "effect/Scope"
import { TemporalWorkerError } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkerConnection extends NativeConnection {}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalWorkerConnection = ServiceMap.Service<TemporalWorkerConnection>(
  "@effect-temporal/workflow/TemporalWorkerConnection"
)

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkerConnectionConfig extends NativeConnectionOptions {}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorker {
  readonly unsafeWorker: Worker
  readonly run: Effect.Effect<void, TemporalWorkerError>
  readonly runUntil: <A>(thunk: () => Promise<A>) => Effect.Effect<A, TemporalWorkerError>
  readonly shutdown: Effect.Effect<void>
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalWorker = ServiceMap.Service<TemporalWorker>(
  "@effect-temporal/workflow/TemporalWorker"
)

const wrap = <A>(
  message: string,
  thunk: () => Promise<A>
): Effect.Effect<A, TemporalWorkerError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new TemporalWorkerError({
        message,
        cause
      })
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeConnection = (
  options: TemporalWorkerConnectionConfig = {}
): Effect.Effect<TemporalWorkerConnection, TemporalWorkerError, Scope.Scope> =>
  Effect.acquireRelease(
    wrap("Failed to connect Temporal worker runtime", () => NativeConnection.connect(options)),
    (connection) => Effect.promise(() => connection.close()).pipe(Effect.orDie)
  )

/**
 * @since 1.0.0
 * @category Layers
 */
export const connectionLayer = (
  options: TemporalWorkerConnectionConfig = {}
): Layer.Layer<TemporalWorkerConnection, TemporalWorkerError> =>
  Layer.effect(TemporalWorkerConnection)(makeConnection(options))

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (
  options: Omit<WorkerOptions, "connection">
): Effect.Effect<TemporalWorker, TemporalWorkerError, TemporalWorkerConnection | Scope.Scope> =>
  Effect.gen(function*() {
    const connection = yield* TemporalWorkerConnection
    const unsafeWorker = yield* Effect.acquireRelease(
      wrap("Failed to create Temporal worker", () =>
        Worker.create({
          ...options,
          connection
        })
      ),
      (worker) =>
        Effect.sync(() => {
          worker.shutdown()
        }).pipe(Effect.orDie)
    )

    return TemporalWorker.of({
      unsafeWorker,
      run: wrap("Temporal worker failed while running", () => unsafeWorker.run()),
      runUntil: <A>(thunk: () => Promise<A>) =>
        wrap("Temporal worker failed while running", () => unsafeWorker.runUntil(thunk)),
      shutdown: Effect.sync(() => {
        unsafeWorker.shutdown()
      })
    })
  })

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (
  options: Omit<WorkerOptions, "connection">
): Layer.Layer<TemporalWorker, TemporalWorkerError, TemporalWorkerConnection> =>
  Layer.effect(TemporalWorker)(make(options))
