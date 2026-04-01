# `@effect-temporal/workflow`

Effect v4 / effect-smol integration for Temporal.

## Current Scope

This package is the first implementation slice:

- Effect-wrapped Temporal connection and workflow client layers
- Effect-wrapped Temporal worker connection / worker layers
- Shared Temporal workflow protocol primitives for signals / queries
- Workflow metadata / registration primitives based on `effect/unstable/workflow`
- A staged `WorkflowEngine` adapter for starting, polling, and cancelling Temporal workflows

## Planned Next Steps

1. Execute registered Effect workflows inside Temporal workers using the shared protocol surface.
2. Complete `Activity` bridging so workflow-side `Activity.make(...)` semantics match `effect-smol`.
3. Replace the provisional query / signal payloads with deterministic typed codecs across client and worker boundaries.
4. Add end-to-end tests against Temporal test infrastructure.

## Status

The package now has client, worker, and protocol scaffolding. Full `Activity` / `DurableDeferred` / `DurableClock` parity still requires the Temporal workflow runtime implementation.

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

This example is the full upstream `effect/workflow` surface, but this package does not implement all of it yet.

- `Workflow` metadata and engine operations (`execute`, `poll`, `interrupt`, `resume`) are present.
- Temporal-side protocol primitives for deferreds and clocks are present.
- Full workflow-runtime execution, `Activity` bridging, and end-to-end `DurableDeferred` / `DurableClock` behavior are still in progress in this repository.

So treat the example as the target usage shape for `effect/workflow`, not as a claim that every line is already executable through `@effect-temporal/workflow` today.
