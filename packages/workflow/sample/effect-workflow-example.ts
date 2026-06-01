import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Activity from "effect/unstable/workflow/Activity"
import * as DurableClock from "effect/unstable/workflow/DurableClock"
import * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"

export class ReserveFailed extends Schema.TaggedErrorClass<ReserveFailed>()("ReserveFailed", {}) {}
export class ApprovalDenied extends Schema.TaggedErrorClass<ApprovalDenied>()("ApprovalDenied", {}) {}
export class PaymentDeclined extends Schema.TaggedErrorClass<PaymentDeclined>()("PaymentDeclined", {}) {}

export const checkoutPayload = Schema.Struct({
  orderId: Schema.String,
  customerId: Schema.String,
  totalCents: Schema.Number
})

export const checkoutSuccess = Schema.Struct({
  orderId: Schema.String,
  chargeId: Schema.String
})

export const checkoutError = Schema.Union([
  ReserveFailed,
  ApprovalDenied,
  PaymentDeclined
])

export const releaseInventory = Activity.make({
  name: "releaseInventory",
  execute: Effect.void
})

export const reserveInventory = Activity.make({
  name: "reserveInventory",
  success: Schema.Struct({ reservationId: Schema.String }),
  error: ReserveFailed,
  execute: Activity.retry(
    Effect.gen(function*() {
      const key = yield* Activity.idempotencyKey("reserveInventory", { includeAttempt: true })
      return {
        reservationId: `reservation-${key}`
      }
    }),
    { times: 3 }
  )
})

export const chargeCard = Activity.make({
  name: "chargeCard",
  success: Schema.Struct({ chargeId: Schema.String }),
  error: PaymentDeclined,
  execute: Effect.succeed({ chargeId: "charge-123" })
})

export const sendEmail = Activity.make({
  name: "sendEmail",
  success: Schema.Literal("email"),
  execute: Effect.succeed("email" as const)
})

export const enqueueWebhook = Activity.make({
  name: "enqueueWebhook",
  success: Schema.Literal("webhook"),
  execute: Effect.succeed("webhook" as const)
})

export const approvalSuccess = Schema.Struct({ approverId: Schema.String })

export const manualApproval = DurableDeferred.make("manualApproval", {
  success: approvalSuccess,
  error: ApprovalDenied
})

export const externalOutcome = DurableDeferred.make("externalOutcome", {
  success: Schema.String,
  error: Schema.String
})

export const reconcileCheckout = Workflow.make({
  name: "ReconcileCheckout",
  payload: {
    orderId: Schema.String
  },
  success: Schema.Void,
  idempotencyKey: ({ orderId }) => orderId
})

export const checkoutWorkflow = Workflow.make({
  name: "CheckoutWorkflow",
  payload: checkoutPayload,
  success: checkoutSuccess,
  error: checkoutError,
  idempotencyKey: ({ orderId }) => orderId,
  suspendedRetrySchedule: Schedule.spaced(Duration.seconds(30))
})
  .annotate(Workflow.SuspendOnFailure, true)
  .annotate(Workflow.CaptureDefects, true)

export const checkoutWorkflowLayer = checkoutWorkflow.toLayer((payload, executionId) =>
  Effect.gen(function*() {
    const approvalToken = yield* DurableDeferred.token(manualApproval)
    const chargeRecorded = DurableDeferred.make(`charge-result/${payload.orderId}`, {
      success: Schema.Struct({ chargeId: Schema.String }),
      error: PaymentDeclined
    })

    yield* Workflow.addFinalizer((exit) =>
      Effect.logDebug("workflow finalized").pipe(
        Effect.annotateLogs({ executionId, exitTag: exit._tag })
      )
    )

    const reservation = yield* checkoutWorkflow.withCompensation(
      reserveInventory.execute,
      () => releaseInventory.execute
    )

    yield* DurableClock.sleep({
      name: `approval-timeout-${payload.orderId}`,
      duration: Duration.minutes(15),
      inMemoryThreshold: Duration.seconds(5)
    })

    yield* Effect.log("send approval request to an external system").pipe(
      Effect.annotateLogs({ approvalToken })
    )

    const approval = yield* (DurableDeferred.raceAll({
      name: "approval-or-outcome",
      success: Schema.Union([
        approvalSuccess,
        Schema.String
      ]),
      error: Schema.Union([ApprovalDenied, Schema.String]),
      effects: [
        DurableDeferred.await(manualApproval),
        DurableDeferred.await(externalOutcome)
      ]
    }).pipe(
      Effect.matchEffect({
        onFailure: (
          error
        ): Effect.Effect<never, ApprovalDenied | PaymentDeclined> =>
          typeof error === "string"
            ? Effect.fail(new PaymentDeclined())
            : Effect.fail(error),
        onSuccess: (
          value
        ): Effect.Effect<Schema.Schema.Type<typeof approvalSuccess>, ApprovalDenied | PaymentDeclined> =>
          typeof value === "string"
            ? Effect.fail(new PaymentDeclined())
            : Effect.succeed(value)
      })
    ))

    const charge = yield* DurableDeferred.into(chargeCard.execute, chargeRecorded)

    yield* Effect.log("approval completed").pipe(
      Effect.annotateLogs({ approverId: approval.approverId })
    )

    yield* Activity.raceAll("notify-customer", [sendEmail, enqueueWebhook])

    yield* Workflow.provideScope(Effect.log("persist audit record in workflow scope"))

    return {
      orderId: payload.orderId,
      chargeId: charge.chargeId,
      reservationId: reservation.reservationId
    }
  }).pipe(
    Effect.map(({ orderId, chargeId }) => ({ orderId, chargeId }))
  )
)

export const workflowEngineLayer = WorkflowEngine.layerMemory

export const startCheckout = Effect.gen(function*() {
  const payload = {
    orderId: "ord_123",
    customerId: "cus_123",
    totalCents: 4200
  }

  const executionId = yield* checkoutWorkflow.executionId(payload)
  const manualApprovalToken = yield* DurableDeferred.tokenFromPayload(manualApproval, {
    workflow: checkoutWorkflow,
    payload
  })
  const externalOutcomeToken = yield* DurableDeferred.tokenFromPayload(externalOutcome, {
    workflow: checkoutWorkflow,
    payload
  })

  const started = yield* checkoutWorkflow.execute(payload)
  const status = yield* checkoutWorkflow.poll(executionId)

  if (Option.isSome(status) && status.value._tag === "Suspended") {
    yield* checkoutWorkflow.resume(executionId)
  }

  yield* checkoutWorkflow.interrupt(executionId)

  return { executionId, started, manualApprovalToken, externalOutcomeToken }
}).pipe(
  Effect.provide(Layer.merge(checkoutWorkflowLayer, workflowEngineLayer))
)

export const approveCheckout = (token: DurableDeferred.Token) =>
  DurableDeferred.succeed(manualApproval, {
    token,
    value: { approverId: "user_123" }
  })

export const rejectCheckout = (token: DurableDeferred.Token) =>
  DurableDeferred.fail(manualApproval, {
    token,
    error: new ApprovalDenied()
  })

export const completeExternalOutcome = (
  token: DurableDeferred.Token,
  exit: Exit.Exit<string, string>
) =>
  DurableDeferred.done(externalOutcome, {
    token,
    exit
  })

export const sampleArtifacts = {
  activities: {
    releaseInventory,
    reserveInventory,
    chargeCard,
    sendEmail,
    enqueueWebhook
  },
  deferreds: {
    manualApproval,
    externalOutcome
  },
  workflows: {
    reconcileCheckout,
    checkoutWorkflow
  },
  layers: {
    checkoutWorkflowLayer,
    workflowEngineLayer
  },
  programs: {
    startCheckout,
    approveCheckout,
    rejectCheckout,
    completeExternalOutcome
  }
}
