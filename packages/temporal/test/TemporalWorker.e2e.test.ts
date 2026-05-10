import * as TemporalTesting from "@effect-temporal/testing"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { fileURLToPath } from "node:url"
import type { EffectTemporalE2EWorkflow } from "./TemporalWorker.e2e-workflows.js"

const workflowsPath = fileURLToPath(new URL("./TemporalWorker.e2e-workflows.ts", import.meta.url))

describe("TemporalWorker e2e", () => {
  it("executes an Effect workflow through a local Temporal worker", async () => {
    const payload = { message: "hello" }

    const runTest = Effect.scoped(
      Effect.gen(function*() {
        const environment = yield* TemporalTesting.makeTimeSkipping()
        const taskQueue = TemporalTesting.makeTaskQueue("effect-temporal-e2e")
        const executeWorkflow = Effect.gen(function*() {
          const client = yield* TemporalTesting.makeClient()
          return yield* client.execute<typeof EffectTemporalE2EWorkflow>("EffectTemporalE2EWorkflow", {
            args: [payload],
            taskQueue,
            workflowId: `${taskQueue}/hello`
          })
        }).pipe(
          Effect.provideService(TemporalTesting.TemporalTestEnvironment, environment),
          Effect.scoped
        )

        return yield* TemporalTesting.runWorkerUntil(
          {
            activities: {
              appendActivity: async () => "activity-result"
            },
            taskQueue,
            workflowsPath
          },
          () => Effect.runPromise(executeWorkflow)
        ).pipe(
          Effect.provideService(TemporalTesting.TemporalTestEnvironment, environment)
        )
      })
    )

    await expect(Effect.runPromise(runTest)).resolves.toBe("hello:activity-result")
  }, 120_000)
})
