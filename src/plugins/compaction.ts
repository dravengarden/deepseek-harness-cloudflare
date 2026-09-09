import { Service, type Context } from "@deepseek-ai/cordis"

export class CompactionService extends Service {
  static inject = ["sessions", "llm", "commands"]

  constructor(ctx: Context) {
    super(ctx, "compaction")
    ctx.commands.register({
      name: "compact",
      description: "Condense earlier session history into a summary",
      run: async (_args, sessionId) => {
        const summary = await this.compactNow(sessionId)
        return summary ? "Session compacted." : "Nothing to compact."
      },
    })
  }

  async compactNow(sessionId: string): Promise<string | undefined> {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) throw new Error("session not found")
    const events = session.events()
    const lastSummary = [...events].reverse().find((event) => event.type === "compaction/summary")
    const throughSeq = lastSummary
      ? Number((lastSummary.payload as { throughSeq?: number }).throughSeq ?? 0)
      : 0
    const tail = events.filter((event) => event.seq > throughSeq)
    if (tail.length < 12) return
    const keep = 8
    const cut = tail[tail.length - keep - 1]
    if (!cut) return
    const history = session.deriveMessages()
    const toSummarize = history.slice(0, Math.max(0, history.length - 6))
    if (toSummarize.length < 4) return
    const summary = await this.ctx.llm.complete({
      messages: [
        {
          role: "system",
          content: "Summarize this agent conversation for future turns. Keep facts, sources, and open questions. No preamble.",
        },
        ...toSummarize,
        { role: "user", content: "Summarize the conversation so far." },
      ],
      tools: [],
    })
    session.append("compaction/summary", { content: summary, throughSeq: cut.seq })
    return summary
  }
}
