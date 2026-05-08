import { TestWorkflowEnvironment } from "@temporalio/testing"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { fileURLToPath } from "node:url"
import * as TemporalClient from "../src/TemporalClient.js"
import * as TemporalConnection from "../src/TemporalConnection.js"
import * as TemporalWorker from "../src/TemporalWorker.js"
import type { EffectTemporalE2EWorkflow } from "./TemporalWorker.e2e-workflows.js"

const workflowsPath = fileURLToPath(new URL("./TemporalWorker.e2e-workflows.ts", import.meta.url))

describe("TemporalWorker e2e", () => {
  let environment: TestWorkflowEnvironment | undefined

  beforeEach(async () => {
    environment = await TestWorkflowEnvironment.createTimeSkipping()
  }, 120_000)

  afterEach(async () => {
    await environment?.teardown()
  })

  it("executes an Effect workflow through a local Temporal worker", async () => {
    expect(environment).toBeDefined()
    const testEnvironment = environment as TestWorkflowEnvironment
    const taskQueue = `effect-temporal-e2e-${Date.now()}`
    const namespace = testEnvironment.namespace === undefined ? {} : { namespace: testEnvironment.namespace }
    const payload = { message: "hello" }

    const executeWorkflow = Effect.scoped(
      Effect.gen(function*() {
        const connection = yield* TemporalConnection.make({ address: testEnvironment.address })
        const client = yield* TemporalClient.make(namespace).pipe(
          Effect.provideService(TemporalConnection.TemporalConnection, connection)
        )

        return yield* client.execute<typeof EffectTemporalE2EWorkflow>("EffectTemporalE2EWorkflow", {
          args: [payload],
          taskQueue,
          workflowId: `${taskQueue}/hello`
        })
      })
    )

    const runWorker = Effect.scoped(
      Effect.gen(function*() {
        const connection = yield* TemporalWorker.makeConnection({ address: testEnvironment.address })
        const worker = yield* TemporalWorker.make({
          ...namespace,
          activities: {
            appendActivity: async () => "activity-result"
          },
          taskQueue,
          workflowsPath
        }).pipe(
          Effect.provideService(TemporalWorker.TemporalWorkerConnection, connection)
        )

        return yield* worker.runUntil(() => Effect.runPromise(executeWorkflow))
      })
    )

    await expect(Effect.runPromise(runWorker)).resolves.toBe("hello:activity-result")
  }, 120_000)
})
