# `@effect-temporal/workflow`

Effect v4 / effect-smol integration for Temporal.

## Current Scope

This package currently provides:

- Effect-wrapped Temporal connection and workflow client layers
- Effect-wrapped Temporal worker connection / worker layers
- Shared Temporal workflow protocol primitives for signals / queries
- Workflow metadata / registration primitives based on `effect/unstable/workflow`
- A client-side `WorkflowEngine` adapter for starting, polling, interrupting, resuming, and completing Temporal-backed workflows
- A Temporal workflow-side runtime adapter for running Effect workflow handlers
- Activity handler bridging for `Activity.make(...)` definitions
- Runtime state support for `DurableDeferred` and `DurableClock`
- Nested workflow execution through Temporal child workflows

## Planned Next Steps

1. Replace the provisional query / signal payloads with deterministic typed codecs across client and worker boundaries.
2. Expand end-to-end tests against Temporal test infrastructure beyond the initial worker/client path.
3. Expand lifecycle parity coverage for interruption, failure suspension, compensation, child workflows, and live worker behavior.
4. Document package-local worker setup and runtime examples as the Temporal e2e harness grows.

## Status

The package now has client, worker, protocol, workflow-runtime, activity-bridge, durable deferred / clock, and child workflow support for the Effect workflow surface used by the sample.

The remaining gap is validation breadth: the current repository includes initial Temporal test-server end-to-end coverage for the worker/client path, but the full runtime bridge still needs broader live Temporal e2e verification across activities, deferreds, durable clocks, lifecycle signals, and child workflows.

## Runtime Adapter

The workflow-side adapter lives in `TemporalWorkflowRuntime`:

- `makeWorkflow(options)` creates a Temporal workflow function from an Effect `Workflow` definition and handler.
- `makeActivities(workflow, activities, options?)` converts `Activity.make(...)` definitions into Temporal worker activity handlers.
- The runtime engine bridges workflow-side Effect activities to Temporal activities or local activities via `activityProxy`.
- Durable deferred completions and durable clocks are stored in workflow runtime state and resume suspended workflow execution.
- Nested workflow execution is mapped to Temporal child workflows.
- `makeRuntimeState(executionId)` and `installBaseHandlers(state)` install the shared query / signal protocol for workflow state, deferred completion, interruption, resume, and clock scheduling.

The client-side adapter lives in `TemporalWorkflowEngine` and is used by normal Effect workflow programs to start, poll, interrupt, resume, complete deferreds, and schedule durable clocks against Temporal workflow executions.

## Testing Temporal-backed workflows

Use `@effect-temporal/testing` for tests that should run against Temporal test
infrastructure without repeating connection, namespace, task queue, and worker
setup in every test file.

```ts
import { describe, expect, it } from "@effect/vitest"
import * as TemporalTesting from "@effect-temporal/testing"
import * as Effect from "effect/Effect"

describe("checkout workflow", () => {
  it("runs with a Temporal test worker", async () => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        const environment = yield* TemporalTesting.makeTimeSkipping()
        const taskQueue = TemporalTesting.makeTaskQueue("checkout")

        const executeWorkflow = checkoutWorkflow.execute({
          orderId: "ord_123",
          customerId: "cus_123",
          totalCents: 4200
        }).pipe(
          Effect.provide(
            TemporalTesting.workflowEngineLayer({
              taskQueue,
              workflowIdPrefix: "test"
            })
          ),
          Effect.provideService(
            TemporalTesting.TemporalTestEnvironment,
            environment
          ),
          Effect.scoped
        )

        return yield* TemporalTesting.runWorkerUntil(
          {
            taskQueue,
            workflowsPath
          },
          () => Effect.runPromise(executeWorkflow)
        ).pipe(
          Effect.provideService(
            TemporalTesting.TemporalTestEnvironment,
            environment
          )
        )
      })
    )

    await expect(Effect.runPromise(program)).resolves.toEqual({
      orderId: "ord_123",
      chargeId: "charge-123"
    })
  })
})
```

The repository e2e tests use the same helpers to dogfood the testing package
while still running a real Temporal test server and worker.

## Example: Full Effect Workflow Surface

The maintained, type-checked example lives in
[`sample/effect-workflow-example.ts`](./sample/effect-workflow-example.ts).

It demonstrates these `effect/workflow` constructs together:

- `Workflow.make`
- workflow annotations (`Workflow.SuspendOnFailure`, `Workflow.CaptureDefects`)
- `workflow.withCompensation(...)`
- `Workflow.addFinalizer(...)`
- `Workflow.provideScope(...)`
- `Activity.make`, `Activity.retry`, `Activity.raceAll`, `Activity.idempotencyKey`
- `DurableDeferred.make`, `DurableDeferred.await`, `DurableDeferred.into`, `DurableDeferred.raceAll`
- `DurableDeferred.token`, `DurableDeferred.tokenFromPayload`, `DurableDeferred.succeed`, `DurableDeferred.fail`, `DurableDeferred.done`
- `DurableClock.sleep`
- workflow lifecycle methods: `execute`, `executionId`, `poll`, `interrupt`, `resume`, `toLayer`

### Temporal status for this repository

This example is the target full upstream `effect/workflow` surface for this package.

- `Workflow` metadata and engine operations (`execute`, `poll`, `interrupt`, `resume`) are present.
- Temporal-side protocol primitives for deferreds and clocks are present.
- Full workflow-runtime execution plus `Activity` / `DurableDeferred` / `DurableClock` behavior are available through `TemporalWorkflowRuntime.makeWorkflow(...)` and `TemporalWorkflowRuntime.makeActivities(...)`.
- Nested workflow execution inside the Temporal runtime is available through Temporal child workflows.

Until the e2e harness covers the full runtime surface, treat the example as the intended usage shape and use it together with live Temporal validation in downstream applications.
