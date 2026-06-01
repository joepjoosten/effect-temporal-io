/**
 * @since 1.0.0
 */
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

/**
 * @since 1.0.0
 * @category Errors
 */
export class TemporalConnectionError extends Data.TaggedError("TemporalConnectionError")<{
  readonly message: string
  readonly cause: unknown
}> {
  constructor(props: { readonly message: string; readonly cause: unknown }) {
    super(props)
  }
}

/**
 * @since 1.0.0
 * @category Errors
 */
export class TemporalClientError extends Data.TaggedError("TemporalClientError")<{
  readonly operation: string
  readonly message: string
  readonly cause: unknown
}> {
  constructor(props: { readonly operation: string; readonly message: string; readonly cause: unknown }) {
    super(props)
  }
}

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalValidationDirection = "input" | "output"

/**
 * @since 1.0.0
 * @category Errors
 */
export class TemporalValidationError extends Data.TaggedError("TemporalValidationError")<{
  readonly operation: string
  readonly direction: TemporalValidationDirection
  readonly message: string
  readonly cause: unknown
}> {
  constructor(props: {
    readonly operation: string
    readonly direction: TemporalValidationDirection
    readonly cause: unknown
  }) {
    super({
      ...props,
      message: `Temporal ${props.direction} validation failed: ${props.operation}`
    })
  }
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeClientError = (operation: string, cause: unknown): TemporalClientError =>
  new TemporalClientError({
    operation,
    message: `Temporal client operation failed: ${operation}`,
    cause
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeConnectionError = (operation: string, cause: unknown): TemporalConnectionError =>
  new TemporalConnectionError({
    message: `Temporal connection operation failed: ${operation}`,
    cause
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeValidationError = (
  operation: string,
  direction: TemporalValidationDirection,
  cause: unknown
): TemporalValidationError =>
  new TemporalValidationError({
    operation,
    direction,
    cause
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const tryClientPromise = <A>(
  operation: string,
  evaluate: () => Promise<A>
): Effect.Effect<A, TemporalClientError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => makeClientError(operation, cause)
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const tryClientSync = <A>(
  operation: string,
  evaluate: () => A
): Effect.Effect<A, TemporalClientError> =>
  Effect.try({
    try: evaluate,
    catch: (cause) => makeClientError(operation, cause)
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const tryConnectionPromise = <A>(
  operation: string,
  evaluate: () => Promise<A>
): Effect.Effect<A, TemporalConnectionError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => makeConnectionError(operation, cause)
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const tryConnectionSync = <A>(
  operation: string,
  evaluate: () => A
): Effect.Effect<A, TemporalConnectionError> =>
  Effect.try({
    try: evaluate,
    catch: (cause) => makeConnectionError(operation, cause)
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const streamClientIterable = <A>(
  operation: string,
  iterable: AsyncIterable<A>
): Stream.Stream<A, TemporalClientError> =>
  Stream.fromAsyncIterable(iterable, (cause) => makeClientError(operation, cause))
