# `@effect-temporal/testing`

Testing helpers for `@effect-temporal/workflow`.

This package provides scoped Effect constructors for Temporal test servers,
workflow clients, workflow engines, and workers. The helpers use
`@temporalio/testing` and automatically wire the test environment address and
namespace into the workflow package services.

```ts
import * as TemporalTesting from "@effect-temporal/testing"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

describe("workflow", () => {
  it.effect("runs against Temporal test infrastructure", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const testEnv = yield* TemporalTesting.makeTimeSkipping()
        const taskQueue = TemporalTesting.makeTaskQueue("checkout")

        const result = yield* TemporalTesting.runWorkerUntil(
          {
            taskQueue,
            workflowsPath: new URL("./workflows.ts", import.meta.url).pathname
          },
          () =>
            Effect.runPromise(
              checkoutWorkflow.execute(payload).pipe(
                Effect.provide(
                  TemporalTesting.workflowEngineLayer({
                    taskQueue
                  })
                ),
                Effect.provideService(
                  TemporalTesting.TemporalTestEnvironment,
                  testEnv
                )
              )
            )
        )

        expect(result).toEqual(expected)
      })
    ))
})
```
