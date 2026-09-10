import type { Context } from "@deepseek-ai/cordis"
import { randomId } from "../lib/ids.ts"

const TIMEOUT_MS = 5 * 60_000

export const name = "tool-ask-user"
export const inject = ["tools", "sessions", "questions"]

export function apply(ctx: Context): void {
  ctx.tools.register({
    name: "ask_user_question",
    description:
      "Ask the human a question and wait for the answer. Use when you need a preference, a choice, or missing facts only the user has.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional multiple-choice options",
        },
      },
      required: ["question"],
    },
    async execute(args) {
      const sessionId = ctx.tools.sessionId
      if (!sessionId) return "Error: ask_user_question requires an owning agent session"
      const session = ctx.sessions.get(sessionId)
      if (!session) return "Error: session not found"
      const question = String(args.question ?? "").trim()
      if (!question) return "Error: question is required"
      const options = Array.isArray(args.options) ? args.options.map((item) => String(item)) : undefined
      const id = randomId("ask")
      session.append("ask/question", { id, question, options })
      try {
        const answer = await ctx.questions.ask(sessionId, id, TIMEOUT_MS, ctx.tools.signal)
        session.append("ask/answer", { id, answer })
        return answer
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}
