import { describe, expect, it } from "@effect/vitest"
import type { Workflow, WorkflowClient } from "@temporalio/client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as TemporalWorkflowClient from "../src/TemporalWorkflowClient.js"

describe("TemporalWorkflowClient", () => {
  it.effect("validates workflow args and result with Schema", () =>
    Effect.gen(function*() {
      const unsafeClient = {
        execute: async (_workflow: string | Workflow, options: { readonly args?: ReadonlyArray<unknown> }) =>
          `${options.args?.[0]}:result`
      } as unknown as WorkflowClient
      const client = TemporalWorkflowClient.fromUnsafe(unsafeClient)

      const result = yield* client.executeWithSchema(
        "Workflow",
        {
          args: ["input"],
          taskQueue: "queue",
          workflowId: "workflow-id"
        },
        {
          args: Schema.Tuple([Schema.String]),
          result: Schema.String
        }
      )

      expect(result).toBe("input:result")
    }))

  it.effect("does not call Temporal when workflow args fail Schema validation", () =>
    Effect.gen(function*() {
      let called = false
      const unsafeClient = {
        execute: async () => {
          called = true
          return "should-not-run"
        }
      } as unknown as WorkflowClient
      const client = TemporalWorkflowClient.fromUnsafe(unsafeClient)

      const exit = yield* Effect.exit(
        client.executeWithSchema(
          "Workflow",
          {
            args: [123] as any,
            taskQueue: "queue",
            workflowId: "workflow-id"
          },
          {
            args: Schema.Tuple([Schema.String]),
            result: Schema.String
          }
        )
      )

      expect(called).toBe(false)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("TemporalValidationError")
        expect(String(exit.cause)).toContain("WorkflowClient.execute.args")
      }
    }))
})
