import { Service, type Context } from "@deepseek-ai/cordis"
import type { Session } from "./session.ts"

export const MAX_SUBAGENT_DEPTH = 3

export class SubagentService extends Service {
  static inject = ["sessions", "agentLoop", "agents"]

  constructor(ctx: Context) {
    super(ctx, "subagents")
  }

  depth(sessionId: string): number {
    let depth = 0
    let current = this.ctx.sessions.get(sessionId)
    const seen = new Set<string>()
    while (current?.record.parentId) {
      if (seen.has(current.id)) break
      seen.add(current.id)
      depth += 1
      current = this.ctx.sessions.get(current.record.parentId)
      if (depth > 16) break
    }
    return depth
  }

  async run(input: {
    parentId: string
    prompt: string
    inherit: boolean
    signal?: AbortSignal
  }): Promise<{ childId: string; result: string }> {
    const parent = this.ctx.sessions.get(input.parentId)
    if (!parent) throw new Error("parent session not found")
    const depth = this.depth(input.parentId)
    if (depth >= MAX_SUBAGENT_DEPTH) {
      throw new Error(`Error: subagent depth cap (${MAX_SUBAGENT_DEPTH}) reached`)
    }

    let child: Session
    if (input.inherit) {
      const events = parent.events()
      const lastEnd = [...events].reverse().find((event) => event.type === "turn/end")
      child = this.ctx.sessions.fork(input.parentId, lastEnd?.seq ?? 0)
    } else {
      child = this.ctx.sessions.create(`subagent of ${parent.title}`, parent.id)
    }
    this.ctx.agents.ensure(child)

    const wrapped = `You are a subagent. You do not speak to the user directly.
${input.inherit ? "You can see the parent's completed turns, not the in-flight turn." : "You do not see the parent conversation; the prompt is self-contained."}
Do not delegate to another subagent unless strictly necessary.
Return a concise final answer.

Task:
${input.prompt}`

    await this.ctx.agentLoop.run(child.id, wrapped, () => {}, input.signal)
    const events = child.events()
    const last = [...events].reverse().find((event) => event.type === "assistant/message")
    const content = last ? String((last.payload as { content?: string }).content ?? "") : ""
    return { childId: child.id, result: content.trim() || "(subagent produced no assistant message)" }
  }
}
