import { describe, expect, it } from "@effect/vitest"
import type { Workflow, WorkflowHandle, WorkflowUpdateHandle } from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as TemporalWorkflowHandle from "../src/TemporalWorkflowHandle.js"

const makeUpdateHandle = (): WorkflowUpdateHandle<string> =>
  ({
    updateId: "update-1",
    workflowId: "workflow-1",
    workflowRunId: "run-1",
    result: async () => "updated"
  }) as WorkflowUpdateHandle<string>

const makeHandle = (): WorkflowHandle<Workflow> =>
  ({
    workflowId: "workflow-1",
    runId: "run-1",
    result: async () => "done",
    describe: async () => ({ workflowId: "workflow-1" }),
    fetchHistory: async () => ({ events: [] }),
    cancel: async () => ({}),
    terminate: async () => ({}),
    query: async (_definition: string) => {
      throw new Error("query failed")
    },
    signal: async () => undefined,
    executeUpdate: async () => "updated",
    startUpdate: async () => makeUpdateHandle(),
    getUpdateHandle: () => makeUpdateHandle()
  }) as unknown as WorkflowHandle<Workflow>

const makeHandleWithResult = (result: unknown): WorkflowHandle<Workflow> =>
  ({
    ...makeHandle(),
    result: async () => result
  }) as unknown as WorkflowHandle<Workflow>

describe("TemporalWorkflowHandle", () => {
  it.effect("wraps successful handle promises", () =>
    Effect.gen(function*() {
      const handle = TemporalWorkflowHandle.fromUnsafe(makeHandle())
      const result = yield* handle.result
      const update = yield* handle.getUpdateHandle<string>("update-1").result

      expect(result).toBe("done")
      expect(update).toBe("updated")
    }))

  it.effect("validates handle results with Schema", () =>
    Effect.gen(function*() {
      const handle = TemporalWorkflowHandle.fromUnsafe(makeHandleWithResult("decoded"))
      const result = yield* handle.resultAs(Schema.String)

      expect(result).toBe("decoded")
    }))

  it.effect("maps invalid handle results into TemporalValidationError", () =>
    Effect.gen(function*() {
      const handle = TemporalWorkflowHandle.fromUnsafe(makeHandleWithResult(123))
      const exit = yield* Effect.exit(handle.resultAs(Schema.String))

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("TemporalValidationError")
        expect(String(exit.cause)).toContain("WorkflowHandle.result")
      }
    }))

  it.effect("maps rejected handle promises into TemporalClientError", () =>
    Effect.gen(function*() {
      const handle = TemporalWorkflowHandle.fromUnsafe(makeHandle())
      const exit = yield* Effect.exit(handle.query("failing-query"))

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("TemporalClientError")
        expect(String(exit.cause)).toContain("WorkflowHandle.query")
      }
    }))
})
