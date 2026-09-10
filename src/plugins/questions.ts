import { Service, type Context } from "@deepseek-ai/cordis"
import type { Env } from "../types.ts"

export interface QuestionConfig {
  env: Env
  identityKey: string
}

export class QuestionService extends Service {
  constructor(
    ctx: Context,
    private readonly config: QuestionConfig,
  ) {
    super(ctx, "questions")
  }

  async ask(sessionId: string, id: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
    const stub = this.config.env.MAILBOX.getByName(this.config.identityKey)
    if (signal?.aborted) {
      await stub.abort(sessionId, id)
      throw new Error("ask_user_question cancelled")
    }
    const onAbort = () => { void stub.abort(sessionId, id) }
    signal?.addEventListener("abort", onAbort)
    try {
      return await stub.ask(sessionId, id, timeoutMs)
    } finally {
      signal?.removeEventListener("abort", onAbort)
      await stub.abort(sessionId, id)
    }
  }
}
