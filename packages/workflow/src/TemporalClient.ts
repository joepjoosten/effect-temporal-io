/**
 * Re-exported Temporal workflow client service.
 *
 * @since 1.0.0
 */
import { type WorkflowExecutionDescription, WorkflowFailedError } from "@temporalio/client"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export * from "@effect-temporal/client/TemporalWorkflowClient"

/**
 * @since 1.0.0
 * @category Models
 */
export class WorkflowExecution extends Schema.Class<WorkflowExecution>("WorkflowExecution")({
  workflowId: Schema.String,
  runId: Schema.optional(Schema.String)
}) {}

/**
 * @since 1.0.0
 * @category Refinements
 */
export const isWorkflowFailure = (error: unknown): error is WorkflowFailedError => error instanceof WorkflowFailedError

/**
 * @since 1.0.0
 * @category Helpers
 */
export const runIdFromDescription = (
  description: WorkflowExecutionDescription
): Option.Option<string> => Option.fromNullishOr(description.runId)
