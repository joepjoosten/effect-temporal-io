# `@effect-temporal/workflow`

Effect v4 / effect-smol integration for Temporal.

## Current Scope

This package is the first implementation slice:

- Effect-wrapped Temporal connection and workflow client layers
- Workflow metadata / registration primitives based on `effect/unstable/workflow`
- A staged `WorkflowEngine` adapter for starting, polling, and cancelling Temporal workflows

## Planned Next Steps

1. Add a Temporal worker runtime that can execute registered Effect workflows.
2. Map `Activity`, `DurableDeferred`, and `DurableClock` onto Temporal-native primitives.
3. Add deterministic serialization and typed error/result encoding across client and worker boundaries.
4. Add end-to-end tests against Temporal test infrastructure.

## Status

The client-side foundation is implemented. The in-workflow Temporal runtime is not implemented yet.
