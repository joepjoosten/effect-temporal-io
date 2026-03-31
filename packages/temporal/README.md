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
