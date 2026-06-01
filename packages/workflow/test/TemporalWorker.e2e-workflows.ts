import { proxyActivities } from "@temporalio/workflow"

export interface E2EPayload {
  readonly message: string
}

export interface E2EActivities {
  readonly appendActivity: () => Promise<string>
}

const activities = proxyActivities<E2EActivities>({
  startToCloseTimeout: "10 seconds"
})

export async function EffectTemporalE2EWorkflow(payload: E2EPayload): Promise<string> {
  const activityResult = await activities.appendActivity()
  return `${payload.message}:${activityResult}`
}
