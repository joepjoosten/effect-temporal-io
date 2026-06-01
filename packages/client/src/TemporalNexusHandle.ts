/**
 * Effect wrappers for Temporal Nexus operation handles.
 *
 * The published Temporal SDK may not expose Nexus yet, while local SDK builds
 * can. These types are structural so the wrapper can support both.
 *
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import { type TemporalClientError, tryClientPromise } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type DescribeNexusOperationOptions = Record<string, unknown>

/**
 * @since 1.0.0
 * @category Models
 */
export type NexusOperationExecutionDescription = unknown

/**
 * @since 1.0.0
 * @category Models
 */
export interface UnsafeNexusOperationHandle<O = unknown> {
  readonly operationId: string
  readonly runId?: string | undefined
  readonly result: () => Promise<O>
  readonly describe: (
    options?: DescribeNexusOperationOptions | undefined
  ) => Promise<NexusOperationExecutionDescription>
  readonly cancel: (reason?: string | undefined) => Promise<void>
  readonly terminate: (reason?: string | undefined) => Promise<void>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalNexusOperationHandle<O = unknown> {
  readonly unsafeHandle: UnsafeNexusOperationHandle<O>
  readonly operationId: string
  readonly runId?: string | undefined
  readonly result: Effect.Effect<O, TemporalClientError>
  readonly describe: (
    options?: DescribeNexusOperationOptions | undefined
  ) => Effect.Effect<NexusOperationExecutionDescription, TemporalClientError>
  readonly cancel: (reason?: string | undefined) => Effect.Effect<void, TemporalClientError>
  readonly terminate: (reason?: string | undefined) => Effect.Effect<void, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = <O>(
  handle: UnsafeNexusOperationHandle<O>
): TemporalNexusOperationHandle<O> => ({
  unsafeHandle: handle,
  operationId: handle.operationId,
  runId: handle.runId,
  result: tryClientPromise("NexusOperationHandle.result", () => handle.result()),
  describe: (options) => tryClientPromise("NexusOperationHandle.describe", () => handle.describe(options)),
  cancel: (reason) => tryClientPromise("NexusOperationHandle.cancel", () => handle.cancel(reason)),
  terminate: (reason) => tryClientPromise("NexusOperationHandle.terminate", () => handle.terminate(reason))
})
