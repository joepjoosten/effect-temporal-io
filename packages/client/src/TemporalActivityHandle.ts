/**
 * Effect wrappers for Temporal activity handles.
 *
 * @since 1.0.0
 */
import type { ActivityExecutionDescription, ActivityHandle } from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { type TemporalClientError, type TemporalValidationError, tryClientPromise } from "./TemporalError.js"
import * as TemporalSchema from "./TemporalSchema.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalActivityHandle<R = unknown> {
  readonly unsafeHandle: ActivityHandle<R>
  readonly activityId: string
  readonly runId?: string | undefined
  readonly result: Effect.Effect<R, TemporalClientError>
  readonly resultAs: <Result extends Schema.Top>(
    schema: Result
  ) => Effect.Effect<Result["Type"], TemporalClientError | TemporalValidationError, Result["DecodingServices"]>
  readonly describe: Effect.Effect<ActivityExecutionDescription, TemporalClientError>
  readonly cancel: (reason: string) => Effect.Effect<void, TemporalClientError>
  readonly terminate: (reason: string) => Effect.Effect<void, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = <R>(handle: ActivityHandle<R>): TemporalActivityHandle<R> => ({
  unsafeHandle: handle,
  activityId: handle.activityId,
  runId: handle.runId,
  result: tryClientPromise("ActivityHandle.result", () => handle.result()),
  resultAs: (schema) =>
    tryClientPromise("ActivityHandle.result", () => handle.result()).pipe(
      Effect.flatMap((value) => TemporalSchema.decodeOutput("ActivityHandle.result", schema, value))
    ),
  describe: tryClientPromise("ActivityHandle.describe", () => handle.describe()),
  cancel: (reason) => tryClientPromise("ActivityHandle.cancel", () => handle.cancel(reason)),
  terminate: (reason) => tryClientPromise("ActivityHandle.terminate", () => handle.terminate(reason))
})
