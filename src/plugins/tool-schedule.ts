import type { Context } from "@deepseek-ai/cordis"

export const name = "tool-schedule"
export const inject = ["tools", "schedule"]

export function apply(ctx: Context): void {
  ctx.tools.register({
    name: "schedule_create",
    description:
      "Create a reminder in this session. Supply a prompt and exactly one of after_seconds, at (ISO datetime), or every_seconds (>= 300).",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        after_seconds: { type: "integer", minimum: 1 },
        at: { type: "string", description: "ISO-8601 datetime" },
        every_seconds: { type: "integer", minimum: 300 },
      },
      required: ["prompt"],
    },
    async execute(args) {
      const sessionId = ctx.tools.sessionId
      if (!sessionId) return "Error: schedule_create requires an owning agent session"
      const prompt = String(args.prompt ?? "").trim()
      if (!prompt) return "Error: prompt is required"
      const hasAfter = args.after_seconds != null
      const hasAt = args.at != null && String(args.at).trim() !== ""
      const hasEvery = args.every_seconds != null
      if (Number(hasAfter) + Number(hasAt) + Number(hasEvery) !== 1) {
        return "Error: supply exactly one of after_seconds, at, or every_seconds"
      }
      let fireAt = Date.now()
      let everyMs: number | undefined
      if (hasAfter) fireAt = Date.now() + Number(args.after_seconds) * 1000
      if (hasAt) {
        const parsed = Date.parse(String(args.at))
        if (!Number.isFinite(parsed)) return "Error: at is not a valid datetime"
        fireAt = parsed
      }
      if (hasEvery) {
        const seconds = Number(args.every_seconds)
        if (seconds < 300) return "Error: every_seconds must be >= 300"
        everyMs = seconds * 1000
        fireAt = Date.now() + everyMs
      }
      const record = ctx.schedule.create({ sessionId, fireAt, prompt, everyMs })
      return JSON.stringify({ id: record.id, fireAt: record.fireAt, everyMs: record.everyMs })
    },
  })

  ctx.tools.register({
    name: "schedule_list",
    description: "List pending reminders for this session.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const sessionId = ctx.tools.sessionId
      if (!sessionId) return "Error: schedule_list requires an owning agent session"
      return JSON.stringify(ctx.schedule.list(sessionId))
    },
  })

  ctx.tools.register({
    name: "schedule_delete",
    description: "Delete a reminder by id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async execute(args) {
      const id = String(args.id ?? "").trim()
      if (!id) return "Error: id is required"
      ctx.schedule.delete(id)
      return JSON.stringify({ ok: true, id })
    },
  })
}
