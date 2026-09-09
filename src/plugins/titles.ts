import type { Context } from "@deepseek-ai/cordis"

export const name = "session-title"
export const inject = ["sessions"]

export function apply(ctx: Context): void {
  ctx.on("session/event", (sessionId, event) => {
    if (event.type !== "user/message") return
    const session = ctx.sessions.get(sessionId)
    if (!session || session.title !== "Untitled") return
    const content = (event.payload as { content?: string }).content
    if (typeof content === "string" && content.trim()) {
      session.rename(content.trim().slice(0, 72))
    }
  })
}
