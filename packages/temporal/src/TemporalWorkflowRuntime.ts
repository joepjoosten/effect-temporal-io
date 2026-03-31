/**
 * @since 1.0.0
 */
import type * as Exit from "effect/Exit"
import { condition, defineQuery, defineSignal, setHandler } from "@temporalio/workflow"
import type {
  CompleteDeferredSignal,
  ScheduleClockSignal,
  TemporalDeferredResult,
  TemporalWorkflowState
} from "./TemporalWorkflowProtocol.js"
import {
  completeDeferredSignalName,
  deferredResultQueryName,
  interruptSignalName,
  resumeSignalName,
  scheduleClockSignalName,
  workflowStateQueryName
} from "./TemporalWorkflowProtocol.js"

/**
 * @since 1.0.0
 * @category Protocol
 */
export const workflowStateQuery = defineQuery<TemporalWorkflowState>(workflowStateQueryName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const deferredResultQuery = defineQuery<TemporalDeferredResult, [name: string]>(deferredResultQueryName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const interruptSignal = defineSignal(interruptSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const resumeSignal = defineSignal(resumeSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const completeDeferredSignal = defineSignal<[CompleteDeferredSignal]>(completeDeferredSignalName)

/**
 * @since 1.0.0
 * @category Protocol
 */
export const scheduleClockSignal = defineSignal<[ScheduleClockSignal]>(scheduleClockSignalName)

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowRuntimeState {
  readonly executionId: string
  status: TemporalWorkflowState["status"]
  interrupted: boolean
  resumed: boolean
  result: TemporalWorkflowState["result"]
  suspendedCause: TemporalWorkflowState["suspendedCause"]
  readonly deferreds: Map<string, Exit.Exit<unknown, unknown>>
  readonly clocks: Map<string, ScheduleClockSignal>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeRuntimeState = (
  executionId: string
): TemporalWorkflowRuntimeState => ({
  executionId,
  status: "running",
  interrupted: false,
  resumed: false,
  result: undefined,
  suspendedCause: undefined,
  deferreds: new Map(),
  clocks: new Map()
})

/**
 * @since 1.0.0
 * @category Runtime
 */
export const installBaseHandlers = (
  state: TemporalWorkflowRuntimeState
): void => {
  setHandler(workflowStateQuery, () => ({
    executionId: state.executionId,
    status: state.status,
    result: state.result,
    suspendedCause: state.suspendedCause
  }))
  setHandler(deferredResultQuery, (name) => {
    const exit = state.deferreds.get(name)
    return exit === undefined
      ? { found: false }
      : { found: true, exit }
  })
  setHandler(interruptSignal, () => {
    state.interrupted = true
    state.status = "suspended"
  })
  setHandler(resumeSignal, () => {
    state.resumed = true
    state.status = "running"
  })
  setHandler(completeDeferredSignal, ({ name, exit }) => {
    state.deferreds.set(name, exit)
    state.resumed = true
  })
  setHandler(scheduleClockSignal, (clock) => {
    state.clocks.set(clock.name, clock)
  })
}

/**
 * @since 1.0.0
 * @category Runtime
 */
export const waitForResume = async (
  state: TemporalWorkflowRuntimeState
): Promise<void> => {
  await condition(() => state.resumed || state.interrupted)
  state.resumed = false
}
