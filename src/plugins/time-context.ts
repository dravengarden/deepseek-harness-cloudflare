import type { Context } from "@deepseek-ai/cordis"

export const name = "time-context"
export const inject = ["systemPrompt"]

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "time",
    order: 20,
    text: () => `Current UTC time: ${new Date().toISOString()}`,
  })
}
