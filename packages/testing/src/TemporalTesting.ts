/**
 * @since 1.0.0
 */
import * as TemporalConnection from "@effect-temporal/client/TemporalConnection"
import * as TemporalDataConverter from "@effect-temporal/client/TemporalDataConverter"
import type * as TemporalClientError from "@effect-temporal/client/TemporalError"
import * as TemporalClient from "@effect-temporal/client/TemporalWorkflowClient"
import type * as TemporalError from "@effect-temporal/workflow/TemporalError"
import * as TemporalWorker from "@effect-temporal/workflow/TemporalWorker"
import * as TemporalWorkflowEngine from "@effect-temporal/workflow/TemporalWorkflowEngine"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalTestEnvironment {
  readonly unsafeEnvironment: TestWorkflowEnvironment
  readonly address: string
  readonly namespace?: string | undefined
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalTestEnvironment = Context.Service<TemporalTestEnvironment>(
  "@effect-temporal/testing/TemporalTestEnvironment"
)

/**
 * @since 1.0.0
 * @category Errors
 */
export class TemporalTestEnvironmentError extends Error {
  readonly _tag = "TemporalTestEnvironmentError"
  constructor(
    readonly options: {
      readonly message: string
      readonly cause?: unknown
    }
  ) {
    super(options.message)
    this.name = this._tag
  }
}

/**
 * @since 1.0.0
 * @category Models
 */
export type TimeSkippingOptions = Parameters<typeof TestWorkflowEnvironment.createTimeSkipping>[0]

/**
 * @since 1.0.0
 * @category Models
 */
export type LocalOptions = Parameters<typeof TestWorkflowEnvironment.createLocal>[0]

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalTestWorkerOptions = Parameters<typeof TemporalWorker.make>[0]

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalTestClientError =
  | TemporalClientError.TemporalConnectionError
  | TemporalClientError.TemporalClientError

const fromUnsafeEnvironment = (
  environment: TestWorkflowEnvironment
): TemporalTestEnvironment =>
  TemporalTestEnvironment.of({
    unsafeEnvironment: environment,
    address: environment.address,
    namespace: environment.namespace
  })

const makeEnvironment = (
  acquire: () => Promise<TestWorkflowEnvironment>,
  message: string
): Effect.Effect<TemporalTestEnvironment, TemporalTestEnvironmentError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: acquire,
      catch: (cause) =>
        new TemporalTestEnvironmentError({
          message,
          cause
        })
    }).pipe(Effect.map(fromUnsafeEnvironment)),
    (environment) => Effect.promise(() => environment.unsafeEnvironment.teardown()).pipe(Effect.orDie)
  )

/**
 * Creates a scoped Temporal test environment with time skipping enabled.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeTimeSkipping = (
  options?: TimeSkippingOptions
): Effect.Effect<TemporalTestEnvironment, TemporalTestEnvironmentError, Scope.Scope> =>
  makeEnvironment(
    () => TestWorkflowEnvironment.createTimeSkipping(options),
    "Failed to create Temporal time-skipping test environment"
  )

/**
 * Creates a scoped local Temporal test environment.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeLocal = (
  options?: LocalOptions
): Effect.Effect<TemporalTestEnvironment, TemporalTestEnvironmentError, Scope.Scope> =>
  makeEnvironment(
    () => TestWorkflowEnvironment.createLocal(options),
    "Failed to create local Temporal test environment"
  )

/**
 * A scoped layer for a time-skipping Temporal test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const layerTimeSkipping = (
  options?: TimeSkippingOptions
): Layer.Layer<TemporalTestEnvironment, TemporalTestEnvironmentError> =>
  Layer.effect(TemporalTestEnvironment)(makeTimeSkipping(options))

/**
 * A scoped layer for a local Temporal test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const layerLocal = (
  options?: LocalOptions
): Layer.Layer<TemporalTestEnvironment, TemporalTestEnvironmentError> =>
  Layer.effect(TemporalTestEnvironment)(makeLocal(options))

/**
 * Creates a unique task queue name for a test.
 *
 * @since 1.0.0
 * @category Helpers
 */
export const makeTaskQueue = (prefix = "effect-temporal-test"): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const namespaceConfig = (
  environment: TemporalTestEnvironment
): Omit<TemporalClient.TemporalWorkflowClientConfig, "connection"> =>
  environment.namespace === undefined ? {} : { namespace: environment.namespace }

const workerNamespaceConfig = (
  environment: TemporalTestEnvironment
): Pick<TemporalTestWorkerOptions, "namespace"> =>
  environment.namespace === undefined ? {} : { namespace: environment.namespace }

/**
 * Creates a scoped client connection to the current test environment.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeConnection: Effect.Effect<
  TemporalConnection.TemporalConnection,
  TemporalClientError.TemporalConnectionError,
  TemporalTestEnvironment | Scope.Scope
> = Effect.gen(function*() {
  const environment = yield* TemporalTestEnvironment
  return yield* TemporalConnection.make({ address: environment.address })
})

/**
 * Creates a scoped workflow client for the current test environment.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeClient = (
  options: Omit<TemporalClient.TemporalWorkflowClientConfig, "connection" | "namespace"> = {}
): Effect.Effect<
  TemporalClient.TemporalWorkflowClient,
  TemporalTestClientError,
  TemporalTestEnvironment | Scope.Scope
> =>
  Effect.gen(function*() {
    const environment = yield* TemporalTestEnvironment
    const connection = yield* makeConnection
    return yield* TemporalClient.make({
      ...namespaceConfig(environment),
      ...options
    }).pipe(
      Effect.provideService(TemporalConnection.TemporalConnection, connection)
    )
  })

/**
 * Creates a scoped workflow client with the configured Temporal data converter.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeClientWithDataConverter = (
  options: Omit<TemporalClient.TemporalWorkflowClientConfig, "connection" | "dataConverter" | "namespace"> = {}
): Effect.Effect<
  TemporalClient.TemporalWorkflowClient,
  TemporalTestClientError,
  TemporalDataConverter.TemporalDataConverter | TemporalTestEnvironment | Scope.Scope
> =>
  Effect.gen(function*() {
    const environment = yield* TemporalTestEnvironment
    const dataConverter = yield* TemporalDataConverter.TemporalDataConverter
    const connection = yield* makeConnection
    return yield* TemporalClient.make({
      ...namespaceConfig(environment),
      ...options,
      dataConverter
    }).pipe(
      Effect.provideService(TemporalConnection.TemporalConnection, connection)
    )
  })

/**
 * Creates a scoped Temporal worker connection to the current test environment.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeWorkerConnection: Effect.Effect<
  TemporalWorker.TemporalWorkerConnection,
  TemporalError.TemporalWorkerError,
  TemporalTestEnvironment | Scope.Scope
> = Effect.gen(function*() {
  const environment = yield* TemporalTestEnvironment
  return yield* TemporalWorker.makeConnection({ address: environment.address })
})

/**
 * Creates a scoped Temporal worker for the current test environment.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makeWorker = (
  options: TemporalTestWorkerOptions
): Effect.Effect<
  TemporalWorker.TemporalWorker,
  TemporalError.TemporalWorkerError,
  TemporalTestEnvironment | Scope.Scope
> =>
  Effect.gen(function*() {
    const environment = yield* TemporalTestEnvironment
    const connection = yield* makeWorkerConnection
    return yield* TemporalWorker.make({
      ...options,
      ...workerNamespaceConfig(environment)
    }).pipe(
      Effect.provideService(TemporalWorker.TemporalWorkerConnection, connection)
    )
  })

/**
 * Runs a Temporal worker until the supplied promise settles.
 *
 * @since 1.0.0
 * @category Helpers
 */
export const runWorkerUntil = <A>(
  options: TemporalTestWorkerOptions,
  thunk: () => Promise<A>
): Effect.Effect<A, TemporalError.TemporalWorkerError, TemporalTestEnvironment | Scope.Scope> =>
  Effect.gen(function*() {
    const worker = yield* makeWorker(options)
    return yield* worker.runUntil(thunk)
  })

/**
 * A scoped client connection layer for the current test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const connectionLayer: Layer.Layer<
  TemporalConnection.TemporalConnection,
  TemporalClientError.TemporalConnectionError,
  TemporalTestEnvironment
> = Layer.effect(TemporalConnection.TemporalConnection)(makeConnection)

/**
 * A scoped workflow client layer for the current test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const clientLayer = (
  options: Omit<TemporalClient.TemporalWorkflowClientConfig, "connection" | "namespace"> = {}
): Layer.Layer<
  TemporalClient.TemporalWorkflowClient,
  TemporalTestClientError,
  TemporalTestEnvironment
> => Layer.effect(TemporalClient.TemporalWorkflowClient)(makeClient(options))

/**
 * A scoped workflow client layer with the configured Temporal data converter.
 *
 * @since 1.0.0
 * @category Layers
 */
export const clientLayerWithDataConverter = (
  options: Omit<TemporalClient.TemporalWorkflowClientConfig, "connection" | "dataConverter" | "namespace"> = {}
): Layer.Layer<
  TemporalClient.TemporalWorkflowClient,
  TemporalTestClientError,
  TemporalDataConverter.TemporalDataConverter | TemporalTestEnvironment
> => Layer.effect(TemporalClient.TemporalWorkflowClient)(makeClientWithDataConverter(options))

/**
 * A scoped workflow engine layer for the current test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const workflowEngineLayer = (
  config: TemporalWorkflowEngine.TemporalWorkflowEngineConfig
): Layer.Layer<
  WorkflowEngine.WorkflowEngine,
  TemporalTestClientError,
  TemporalTestEnvironment
> =>
  Layer.effect(
    WorkflowEngine.WorkflowEngine,
    Effect.gen(function*() {
      const client = yield* makeClient()
      return yield* TemporalWorkflowEngine.make(config).pipe(
        Effect.provideService(TemporalClient.TemporalWorkflowClient, client)
      )
    })
  )

/**
 * A scoped worker layer for the current test environment.
 *
 * @since 1.0.0
 * @category Layers
 */
export const workerLayer = (
  options: TemporalTestWorkerOptions
): Layer.Layer<
  TemporalWorker.TemporalWorker,
  TemporalError.TemporalWorkerError,
  TemporalTestEnvironment
> => Layer.effect(TemporalWorker.TemporalWorker)(makeWorker(options))
