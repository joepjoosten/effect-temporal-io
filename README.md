# Effect Temporal IO

This repository contains an Effect v4 / effect-smol integration for
Temporal. The first package is `@effect-temporal/workflow`, which provides
Effect-friendly wrappers around Temporal connections, workflow clients,
workers, and the protocol primitives needed to map
`effect/unstable/workflow` onto Temporal executions.

The current implementation includes client, worker, workflow metadata,
workflow-engine operations, workflow runtime execution, activity bridging,
deferred result protocols, durable clock handling, and child workflow
execution. Initial live Temporal end-to-end coverage is in place for the
worker/client path, and broader runtime coverage is still being expanded.

## How Effect workflows interoperate with Temporal

Effect workflows are described with `effect/unstable/workflow`. They define a
workflow name, payload schema, success schema, error schema, idempotency key,
and an Effect program that represents the workflow body.

Temporal provides the durable execution runtime. The integration maps the
Effect workflow surface onto Temporal in these layers:

- `TemporalWorkflowEngine` implements the Effect `WorkflowEngine` interface
  by starting, polling, interrupting, resuming, and completing Temporal
  workflow executions.
- `TemporalClient` wraps `@temporalio/client` in Effect services so Temporal
  client operations can be composed, provided, retried, and tested like other
  Effect dependencies.
- `TemporalWorker` wraps `@temporalio/worker` in Effect services so worker
  lifecycle management can be acquired and released through `Layer` / `Scope`.
- `TemporalWorkflowProtocol` defines reserved query and signal names used by
  the engine and workflow runtime. These include workflow state queries,
  interrupt / resume signals, deferred completion signals, and clock schedule
  signals.
- `TemporalWorkflowRuntime` installs the base Temporal workflow handlers for
  those protocol queries and signals inside a Temporal workflow isolate.

The important boundary is that Temporal owns durable scheduling and replay,
while Effect owns the typed workflow model and dependency graph. A client-side
Effect program can call `workflow.execute`, `workflow.poll`,
`workflow.interrupt`, or `workflow.resume`; the Temporal engine translates
those calls into Temporal workflow start, result, describe, query, and signal
operations.

Workflow IDs are derived from the Effect workflow name and execution ID:

```ts
`${workflowIdPrefix ?? workflowName}/${executionId}`
```

This means a stable Effect idempotency key becomes a stable Temporal workflow
ID, so repeated starts can attach to the existing Temporal execution instead
of creating a duplicate.

## Defining workflows

The maintained example lives in
[`packages/temporal/sample/effect-workflow-example.ts`](./packages/temporal/sample/effect-workflow-example.ts).
It shows the intended `effect/unstable/workflow` shape:

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Workflow from "effect/unstable/workflow/Workflow"

export const checkoutWorkflow = Workflow.make({
  name: "CheckoutWorkflow",
  payload: Schema.Struct({
    orderId: Schema.String,
    customerId: Schema.String,
    totalCents: Schema.Number
  }),
  success: Schema.Struct({
    orderId: Schema.String,
    chargeId: Schema.String
  }),
  idempotencyKey: ({ orderId }) => orderId
})

export const checkoutWorkflowLayer = checkoutWorkflow.toLayer((payload, executionId) =>
  Effect.gen(function*() {
    yield* Effect.log("running checkout").pipe(
      Effect.annotateLogs({ executionId, orderId: payload.orderId })
    )

    return {
      orderId: payload.orderId,
      chargeId: "charge-123"
    }
  })
)
```

The workflow definition is normal TypeScript, but anything that runs inside a
Temporal workflow must still follow Temporal workflow restrictions. Keep
workflow code deterministic, avoid direct network / filesystem / random /
wall-clock access in workflow code, and move side effects into activities.

## Starting workflows from Effect

Use the Temporal connection and client layers, then provide the Temporal
workflow engine layer to the Effect workflow program:

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  TemporalClient,
  TemporalConnection,
  TemporalWorkflowEngine
} from "@effect-temporal/workflow"
import { checkoutWorkflow } from "./workflows.js"

const temporalLayer = Layer.mergeAll(
  TemporalConnection.layer({ address: "localhost:7233" }),
  TemporalClient.layer(),
  TemporalWorkflowEngine.layer({
    taskQueue: "checkout",
    workflowIdPrefix: "checkout"
  })
)

const program = checkoutWorkflow.execute({
  orderId: "ord_123",
  customerId: "cus_123",
  totalCents: 4200
})

Effect.runPromise(Effect.provide(program, temporalLayer))
```

`TemporalWorkflowEngine.layer` needs the task queue that worker processes are
polling. The optional `workflowIdPrefix` is useful when several applications
or environments share a Temporal namespace.

## Setting up a Temporal worker

A Temporal worker needs a task queue and a workflow bundle entrypoint. The
worker process itself can be managed as an Effect application with
`TemporalWorker.layer`:

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { TemporalWorker } from "@effect-temporal/workflow"

const workflowsPath = fileURLToPath(new URL("./temporal-workflows.js", import.meta.url))

const workerLayer = Layer.mergeAll(
  TemporalWorker.connectionLayer({ address: "localhost:7233" }),
  TemporalWorker.layer({
    taskQueue: "checkout",
    workflowsPath
  })
)

const runWorker = Effect.gen(function*() {
  const worker = yield* TemporalWorker.TemporalWorker
  yield* worker.run
})

Effect.runPromise(Effect.provide(runWorker, workerLayer))
```

The workflow bundle entrypoint is the file passed as `workflowsPath`. In that
file, export Temporal workflow functions created by `TemporalWorkflowRuntime`:

```ts
import { TemporalWorkflowRuntime } from "@effect-temporal/workflow"
import {
  checkoutWorkflow,
  checkoutWorkflowProgram,
  releaseInventory,
  reserveInventory
} from "./workflows.js"

export const CheckoutWorkflow = TemporalWorkflowRuntime.makeWorkflow({
  workflow: checkoutWorkflow,
  execute: checkoutWorkflowProgram,
  activityProxy: {
    options: { startToCloseTimeout: "10 minutes" }
  }
})

export const activities = TemporalWorkflowRuntime.makeActivities(
  checkoutWorkflow,
  [reserveInventory, releaseInventory]
)
```

For local development, start Temporal first, then run one or more worker
processes for the task queue:

```sh
temporal server start-dev
pnpm tsx ./path/to/worker.ts
```

Then start workflows from a client process that uses the same Temporal address,
namespace, and task queue.

## Deployment considerations

- **Current package status:** the runtime adapter covers the sample's core
  workflow execution, activity, durable deferred, durable clock, and child
  workflow paths. The repository has initial live Temporal e2e coverage for
  `TemporalWorker` / `TemporalClient` through `@temporalio/testing`; broader
  live coverage for the full Effect workflow-runtime surface remains the main
  validation gap.
- **Determinism:** workflow code is replayed by Temporal. Do not call
  non-deterministic APIs directly from workflow code. Use Temporal workflow
  APIs or activities for time, randomness, network calls, database calls, and
  other side effects.
- **Worker isolation:** code imported by `workflowsPath` runs in Temporal's
  workflow isolate. Keep Node-only APIs and regular Effect services out of that
  bundle unless they are explicitly workflow-safe.
- **Activities:** activity bridging runs through `TemporalWorkflowRuntime`
  activity proxies. Keep production side effects behind Temporal activities.
- **Signals and queries:** the integration reserves query / signal names that
  start with `__effect_workflow_`. Avoid reusing those names in application
  workflow code.
- **Workflow IDs:** choose idempotency keys carefully. Reusing the same
  execution ID for the same workflow name resolves to the same Temporal
  workflow ID.
- **Task queues:** clients and workers must agree on the task queue. Use
  separate queues for independently deployable worker groups or incompatible
  workflow versions.
- **Versioning:** Temporal may replay old workflow histories against new code.
  Avoid changing workflow behavior in ways that break replay. Use Temporal's
  workflow versioning patterns when deploying incompatible changes.
- **Payloads:** schemas describe the Effect workflow boundary, but Temporal
  still serializes payloads across the client / worker boundary. Keep payloads
  serializable and plan codec evolution for long-lived workflows.

## Running Code

This project leverages [tsx](https://tsx.is) to allow execution of TypeScript files via NodeJS as if they were written in plain JavaScript.

To execute a file with `tsx`:

```sh
pnpm tsx ./path/to/the/file.ts
```

## Operations

**Building**

To build all packages in the monorepo:

```sh
pnpm build
```

**Testing**

To test all packages in the monorepo:

```sh
pnpm test
```
