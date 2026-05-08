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

## Planned Next Steps

1. Add end-to-end tests against Temporal test infrastructure.
2. Replace the provisional query / signal payloads with deterministic typed codecs across client and worker boundaries.
3. Expand lifecycle parity coverage for interruption, failure suspension, compensation, and child workflow behavior.
4. Document a full worker setup example once the Temporal e2e harness is in place.

## Status

The package now has client, worker, protocol, and workflow-runtime scaffolding. The runtime adapter can execute Effect workflow handlers inside Temporal workflows, bridge Effect activities to Temporal activities, and persist / resume `DurableDeferred` and `DurableClock` state through the workflow runtime.

The remaining gap is validation breadth: the current repository does not yet include Temporal test-server end-to-end coverage, so the runtime bridge is type-checked and unit-test compatible but still needs live Temporal e2e verification.

## Runtime Adapter

The workflow-side adapter lives in `TemporalWorkflowRuntime`:

- `makeWorkflow(workflow, execute, options?)` creates a Temporal workflow function from an Effect `Workflow` definition and handler.
- `makeActivities(activities)` converts `Activity.make(...)` definitions into Temporal worker activity handlers.
- `makeWorkflowEngine(state, options?)` creates the workflow-isolate `WorkflowEngine` used by the generated workflow function.
- `makeRuntimeState(executionId)` and `installBaseHandlers(state)` install the shared query / signal protocol for workflow state, deferred completion, interruption, resume, and clock scheduling.

The client-side adapter lives in `TemporalWorkflowEngine` and is used by normal Effect workflow programs to start, poll, interrupt, resume, complete deferreds, and schedule durable clocks against Temporal workflow executions.

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
- Workflow-runtime execution and activity bridging are present through `TemporalWorkflowRuntime`.
- `DurableDeferred` and `DurableClock` runtime state handling is present, pending live Temporal e2e coverage.

Until the e2e harness lands, treat the example as the intended usage shape and use it together with live Temporal validation in downstream applications.
