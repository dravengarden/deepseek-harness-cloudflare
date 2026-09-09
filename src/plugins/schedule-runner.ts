import type { Context } from "@deepseek-ai/cordis"
import type { ScheduleRecord } from "./schedule.ts"

export const name = "schedule-runner"
export const inject = ["schedule", "agentLoop", "sessions"]

export function apply(ctx: Context): void {
  ctx.on("schedule/due", (item: ScheduleRecord) => {
    void ctx.agentLoop.run(item.sessionId, item.prompt, () => {})
  })
}
