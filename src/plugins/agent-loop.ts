import { Service, type Context } from "@deepseek-ai/cordis"
import type { ToolCall, TurnEvent } from "../types.ts"

const MAX_STEPS = 12

export class AgentLoop extends Service {
  static inject = ["sessions", "llm", "tools", "systemPrompt", "agents", "skills", "compaction"]
  private readonly inflight = new Map<string, AbortController>()

  constructor(ctx: Context) {
    super(ctx, "agentLoop")
  }

  cancel(sessionId: string): void {
    this.inflight.get(sessionId)?.abort()
  }

  async run(
    sessionId: string,
    userText: string,
    onEvent: (event: TurnEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) throw new Error("session not found")
    const agent = this.ctx.agents.ensure(session)
    const local = new AbortController()
    this.inflight.set(sessionId, local)
    const onAbort = () => local.abort()
    signal?.addEventListener("abort", onAbort)
    const previousSession = this.ctx.tools.sessionId
    const previousSignal = this.ctx.tools.signal
    this.ctx.tools.sessionId = sessionId
    this.ctx.tools.signal = local.signal

    const emit = (type: string, payload: unknown) => {
      const event = session.append(type, payload)
      onEvent({ type, payload: { ...(payload as object), seq: event.seq } })
    }
    const onSessionEvent = (id: string, event: { type: string; payload: unknown; seq: number }) => {
      if (id !== sessionId) return
      if (event.type === "ask/question" || event.type === "todo/write") {
        onEvent({ type: event.type, payload: { ...(event.payload as object), seq: event.seq } })
      }
    }
    const stopForward = this.ctx.on("session/event", onSessionEvent)

    try {
      emit("turn/start", {})
      emit("user/message", { content: userText })
      await this.injectNamedSkills(sessionId, userText, emit)
      this.ctx.emit("agent/turn-start", agent)

      for (let step = 0; step < MAX_STEPS; step += 1) {
        await this.prepareStep(sessionId, emit)
        emit("step/start", { step })
        const toolCalls: ToolCall[] = []
        let text = ""
        const messages = [
          { role: "system" as const, content: this.ctx.systemPrompt.assemble() },
          ...session.deriveMessages(),
        ]
        for await (const delta of this.ctx.llm.stream({
          messages,
          tools: this.ctx.tools.schemas(),
          signal: local.signal,
        })) {
          if (delta.kind === "thinking" && delta.text) {
            emit("assistant/thinking", { text: delta.text })
          } else if (delta.kind === "text" && delta.text) {
            text += delta.text
            emit("assistant/chunk", { text: delta.text })
          } else if (delta.kind === "tool_call" && delta.toolCall) {
            toolCalls.push(delta.toolCall)
            emit("tool/call", {
              id: delta.toolCall.id,
              name: delta.toolCall.function.name,
              arguments: delta.toolCall.function.arguments,
            })
          }
        }

        if (toolCalls.length === 0) {
          emit("assistant/message", { content: text })
          emit("step/end", { step })
          break
        }

        emit("assistant/message", { content: text || null, tool_calls: toolCalls })
        for (const call of toolCalls) {
          const result = await this.ctx.tools.execute(
            call.function.name,
            call.function.arguments,
            local.signal,
          )
          emit("tool/result", { id: call.id, name: call.function.name, content: result })
        }
        emit("step/end", { step })
      }

      emit("turn/end", {})
      this.ctx.emit("agent/turn-end", agent)
    } finally {
      stopForward()
      this.ctx.tools.sessionId = previousSession
      this.ctx.tools.signal = previousSignal
      signal?.removeEventListener("abort", onAbort)
      local.abort()
      this.inflight.delete(sessionId)
    }
  }

  private async injectNamedSkills(
    sessionId: string,
    userText: string,
    emit: (type: string, payload: unknown) => void,
  ): Promise<void> {
    const tokens = userText.match(/\/([a-z0-9]+(?:-[a-z0-9]+)*)/g) ?? []
    const seen = new Set<string>()
    for (const token of tokens) {
      const skillName = token.slice(1)
      if (seen.has(skillName)) continue
      seen.add(skillName)
      const skill = await this.ctx.skills.get(skillName)
      if (!skill?.invocation.userInvocable) continue
      emit("skill/inject", { name: skill.name, content: this.ctx.skills.renderBody(skill) })
    }
  }

  private async prepareStep(
    sessionId: string,
    emit: (type: string, payload: unknown) => void,
  ): Promise<void> {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) return
    const history = session.deriveMessages()
    if (history.length >= 24) await this.ctx.compaction.compactNow(sessionId)
    const skills = await this.ctx.skills.snapshot()
    const digest = this.ctx.skills.digest(skills)
    const lastCatalog = [...session.events()].reverse().find((event) => event.type === "skill/catalog")
    const lastDigest = lastCatalog ? String((lastCatalog.payload as { digest?: string }).digest ?? "") : ""
    if (digest && digest !== lastDigest) {
      emit("skill/catalog", { content: this.ctx.skills.renderCatalog(skills), digest })
    }
  }
}
