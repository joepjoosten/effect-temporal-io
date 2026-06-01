/**
 * Effect wrappers for Temporal schedule handles.
 *
 * @since 1.0.0
 */
import type {
  Backfill,
  ScheduleDescription,
  ScheduleHandle,
  ScheduleOptionsAction,
  ScheduleOverlapPolicy,
  ScheduleUpdateOptions
} from "@temporalio/client"
import * as Effect from "effect/Effect"
import { type TemporalClientError, tryClientPromise } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalScheduleHandle {
  readonly unsafeHandle: ScheduleHandle
  readonly scheduleId: string
  readonly describe: Effect.Effect<ScheduleDescription, TemporalClientError>
  readonly update: <A extends ScheduleOptionsAction = ScheduleOptionsAction>(
    update: (previous: ScheduleDescription) => ScheduleUpdateOptions<A>
  ) => Effect.Effect<void, TemporalClientError>
  readonly delete: Effect.Effect<void, TemporalClientError>
  readonly trigger: (overlap?: ScheduleOverlapPolicy | undefined) => Effect.Effect<void, TemporalClientError>
  readonly backfill: (options: Backfill | ReadonlyArray<Backfill>) => Effect.Effect<void, TemporalClientError>
  readonly pause: (note?: string | undefined) => Effect.Effect<void, TemporalClientError>
  readonly unpause: (note?: string | undefined) => Effect.Effect<void, TemporalClientError>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = (handle: ScheduleHandle): TemporalScheduleHandle => ({
  unsafeHandle: handle,
  scheduleId: handle.scheduleId,
  describe: tryClientPromise("ScheduleHandle.describe", () => handle.describe()),
  update: (update) => tryClientPromise("ScheduleHandle.update", () => handle.update(update as any)),
  delete: tryClientPromise("ScheduleHandle.delete", () => handle.delete()),
  trigger: (overlap) => tryClientPromise("ScheduleHandle.trigger", () => handle.trigger(overlap)),
  backfill: (options) => tryClientPromise("ScheduleHandle.backfill", () => handle.backfill(options as any)),
  pause: (note) => tryClientPromise("ScheduleHandle.pause", () => handle.pause(note)),
  unpause: (note) => tryClientPromise("ScheduleHandle.unpause", () => handle.unpause(note))
})
