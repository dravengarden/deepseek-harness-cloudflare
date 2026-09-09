import type { ChatMessage, SessionEvent } from "../types.ts"

export function deriveMessages(events: SessionEvent[]): ChatMessage[] {
  const lastSummary = [...events].reverse().find((event) => event.type === "compaction/summary")
  const throughSeq = lastSummary
    ? Number((lastSummary.payload as { throughSeq?: number }).throughSeq ?? 0)
    : 0
  const messages: ChatMessage[] = []
  if (lastSummary) {
    const content = String((lastSummary.payload as { content?: string }).content ?? "")
    if (content) messages.push({ role: "user", content: `Conversation summary:\n${content}` })
  }
  for (const event of events) {
    if (event.seq <= throughSeq) continue
    const payload = event.payload as Record<string, unknown>
    if (
      (event.type === "user/message" || event.type === "skill/catalog" || event.type === "skill/inject")
      && typeof payload.content === "string"
    ) {
      messages.push({ role: "user", content: payload.content })
    } else if (event.type === "assistant/message") {
      messages.push({
        role: "assistant",
        content: typeof payload.content === "string" ? payload.content : null,
        tool_calls: Array.isArray(payload.tool_calls) ? payload.tool_calls as ChatMessage["tool_calls"] : undefined,
      })
    } else if (event.type === "tool/result" && typeof payload.id === "string") {
      messages.push({
        role: "tool",
        tool_call_id: payload.id,
        content: String(payload.content ?? ""),
      })
    }
  }
  return messages
}
