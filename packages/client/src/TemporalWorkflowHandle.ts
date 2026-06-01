/**
 * Effect wrappers for Temporal workflow handles.
 *
 * @since 1.0.0
 */
import type {
  QueryDefinition,
  SignalDefinition,
  UpdateDefinition,
  Workflow,
  WorkflowHandle,
  WorkflowResultType,
  WorkflowUpdateHandle,
  WorkflowUpdateOptions
} from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { type TemporalClientError, type TemporalValidationError, tryClientPromise } from "./TemporalError.js"
import * as TemporalSchema from "./TemporalSchema.js"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowUpdateHandle<Ret> {
  readonly unsafeHandle: WorkflowUpdateHandle<Ret>
  readonly updateId: string
  readonly workflowId: string
  readonly workflowRunId?: string | undefined
  readonly result: Effect.Effect<Ret, TemporalClientError>
  readonly resultAs: <Result extends Schema.Top>(
    schema: Result
  ) => Effect.Effect<Result["Type"], TemporalClientError | TemporalValidationError, Result["DecodingServices"]>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafeUpdateHandle = <Ret>(
  handle: WorkflowUpdateHandle<Ret>
): TemporalWorkflowUpdateHandle<Ret> => ({
  unsafeHandle: handle,
  updateId: handle.updateId,
  workflowId: handle.workflowId,
  workflowRunId: handle.workflowRunId,
  result: tryClientPromise("WorkflowUpdateHandle.result", () => handle.result()),
  resultAs: (schema) =>
    tryClientPromise("WorkflowUpdateHandle.result", () => handle.result()).pipe(
      Effect.flatMap((value) => TemporalSchema.decodeOutput("WorkflowUpdateHandle.result", schema, value))
    )
})

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalWorkflowHandle<T extends Workflow = Workflow> {
  readonly unsafeHandle: WorkflowHandle<T>
  readonly workflowId: string
  readonly runId?: string | undefined
  readonly firstExecutionRunId?: string | undefined
  readonly result: Effect.Effect<WorkflowResultType<T>, TemporalClientError>
  readonly resultAs: <Result extends Schema.Top>(
    schema: Result
  ) => Effect.Effect<Result["Type"], TemporalClientError | TemporalValidationError, Result["DecodingServices"]>
  readonly describe: Effect.Effect<Awaited<ReturnType<WorkflowHandle<T>["describe"]>>, TemporalClientError>
  readonly fetchHistory: Effect.Effect<Awaited<ReturnType<WorkflowHandle<T>["fetchHistory"]>>, TemporalClientError>
  readonly cancel: Effect.Effect<Awaited<ReturnType<WorkflowHandle<T>["cancel"]>>, TemporalClientError>
  readonly terminate: (
    reason?: string | undefined
  ) => Effect.Effect<Awaited<ReturnType<WorkflowHandle<T>["terminate"]>>, TemporalClientError>
  readonly query: <Ret, Args extends any[] = []>(
    definition: QueryDefinition<Ret, Args> | string,
    ...args: Args
  ) => Effect.Effect<Ret, TemporalClientError>
  readonly queryAs: <Result extends Schema.Top, Args extends any[] = []>(
    schema: Result,
    definition: QueryDefinition<Result["Type"], Args> | string,
    ...args: Args
  ) => Effect.Effect<Result["Type"], TemporalClientError | TemporalValidationError, Result["DecodingServices"]>
  readonly signal: <Args extends any[]>(
    definition: SignalDefinition<Args> | string,
    ...args: Args
  ) => Effect.Effect<void, TemporalClientError>
  readonly executeUpdate: <Ret, Args extends any[]>(
    definition: UpdateDefinition<Ret, Args> | string,
    options?: WorkflowUpdateOptions & { readonly args?: Args | undefined }
  ) => Effect.Effect<Ret, TemporalClientError>
  readonly executeUpdateAs: <Result extends Schema.Top, Args extends any[]>(
    schema: Result,
    definition: UpdateDefinition<Result["Type"], Args> | string,
    options?: WorkflowUpdateOptions & { readonly args?: Args | undefined }
  ) => Effect.Effect<Result["Type"], TemporalClientError | TemporalValidationError, Result["DecodingServices"]>
  readonly startUpdate: <Ret, Args extends any[]>(
    definition: UpdateDefinition<Ret, Args> | string,
    options: WorkflowUpdateOptions & {
      readonly args?: Args | undefined
      readonly waitForStage: "ACCEPTED"
    }
  ) => Effect.Effect<TemporalWorkflowUpdateHandle<Ret>, TemporalClientError>
  readonly getUpdateHandle: <Ret>(updateId: string) => TemporalWorkflowUpdateHandle<Ret>
}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fromUnsafe = <T extends Workflow>(
  handle: WorkflowHandle<T>
): TemporalWorkflowHandle<T> => ({
  unsafeHandle: handle,
  workflowId: handle.workflowId,
  runId: (handle as { readonly runId?: string | undefined }).runId,
  firstExecutionRunId: "firstExecutionRunId" in handle && typeof handle.firstExecutionRunId === "string"
    ? handle.firstExecutionRunId
    : undefined,
  result: tryClientPromise("WorkflowHandle.result", () => handle.result()),
  resultAs: (schema) =>
    tryClientPromise("WorkflowHandle.result", () => handle.result()).pipe(
      Effect.flatMap((value) => TemporalSchema.decodeOutput("WorkflowHandle.result", schema, value))
    ),
  describe: tryClientPromise("WorkflowHandle.describe", () => handle.describe()),
  fetchHistory: tryClientPromise("WorkflowHandle.fetchHistory", () => handle.fetchHistory()),
  cancel: tryClientPromise("WorkflowHandle.cancel", () => handle.cancel()),
  terminate: (reason) => tryClientPromise("WorkflowHandle.terminate", () => handle.terminate(reason)),
  query: (definition, ...args) => tryClientPromise("WorkflowHandle.query", () => handle.query(definition, ...args)),
  queryAs: (schema, definition, ...args) =>
    tryClientPromise("WorkflowHandle.query", () => handle.query(definition, ...args)).pipe(
      Effect.flatMap((value) => TemporalSchema.decodeOutput("WorkflowHandle.query", schema, value))
    ),
  signal: (definition, ...args) => tryClientPromise("WorkflowHandle.signal", () => handle.signal(definition, ...args)),
  executeUpdate: (definition, options) =>
    tryClientPromise(
      "WorkflowHandle.executeUpdate",
      () => (handle.executeUpdate as (...args: ReadonlyArray<any>) => Promise<unknown>)(definition, options)
    ).pipe(
      Effect.map((value) => value as never)
    ),
  executeUpdateAs: (schema, definition, options) =>
    tryClientPromise(
      "WorkflowHandle.executeUpdate",
      () => (handle.executeUpdate as (...args: ReadonlyArray<any>) => Promise<unknown>)(definition, options)
    ).pipe(
      Effect.flatMap((value) => TemporalSchema.decodeOutput("WorkflowHandle.executeUpdate", schema, value))
    ),
  startUpdate: (definition, options) =>
    tryClientPromise(
      "WorkflowHandle.startUpdate",
      () =>
        (handle.startUpdate as (...args: ReadonlyArray<any>) => Promise<WorkflowUpdateHandle<unknown>>)(
          definition,
          options
        )
    ).pipe(
      Effect.map((updateHandle) => fromUnsafeUpdateHandle(updateHandle as WorkflowUpdateHandle<any>))
    ),
  getUpdateHandle: (updateId) => fromUnsafeUpdateHandle(handle.getUpdateHandle(updateId))
})
