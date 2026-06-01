/**
 * @since 1.0.0
 */
import type * as Exit from "effect/Exit"
import type * as Workflow from "effect/unstable/workflow/Workflow"

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalWorkflowStatus = "running" | "suspended" | "completed"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowState {
  readonly executionId: string
  readonly status: TemporalWorkflowStatus
  readonly result?: Workflow.ResultEncoded<unknown, unknown> | undefined
  readonly suspendedCause?: unknown
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalDeferredResult {
  readonly found: boolean
  readonly exit?: Exit.Exit<unknown, unknown> | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface CompleteDeferredSignal {
  readonly name: string
  readonly exit: Exit.Exit<unknown, unknown>
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface ScheduleClockSignal {
  readonly name: string
  readonly durationMs: number
}

/**
 * @since 1.0.0
 * @category Constants
 */
export const workflowStateQueryName = "__effect_workflow_state"

/**
 * @since 1.0.0
 * @category Constants
 */
export const deferredResultQueryName = "__effect_workflow_deferred_result"

/**
 * @since 1.0.0
 * @category Constants
 */
export const interruptSignalName = "__effect_workflow_interrupt"

/**
 * @since 1.0.0
 * @category Constants
 */
export const resumeSignalName = "__effect_workflow_resume"

/**
 * @since 1.0.0
 * @category Constants
 */
export const completeDeferredSignalName = "__effect_workflow_complete_deferred"

/**
 * @since 1.0.0
 * @category Constants
 */
export const scheduleClockSignalName = "__effect_workflow_schedule_clock"

/**
 * @since 1.0.0
 * @category Helpers
 */
export const workflowIdFor = (
  workflowName: string,
  executionId: string,
  workflowIdPrefix?: string | undefined
): string => `${workflowIdPrefix ?? workflowName}/${executionId}`
