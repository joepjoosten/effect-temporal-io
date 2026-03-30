/**
 * @since 1.0.0
 */
import * as Data from "effect/Data"

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
export class TemporalRequestError extends Data.TaggedError("TemporalRequestError")<{
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
export class TemporalWorkflowEngineError extends Data.TaggedError("TemporalWorkflowEngineError")<{
  readonly message: string
}> {
  constructor(props: { readonly message: string }) {
    super(props)
  }
}
