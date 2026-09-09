import { Service, type Context } from "@deepseek-ai/cordis"
import type { Env } from "../types.ts"

export interface QuestionConfig {
  env: Env
}

export class QuestionService extends Service {
  constructor(
    ctx: Context,
    private readonly config: QuestionConfig,
  ) {
    super(ctx, "questions")
  }

  async ask(sessionId: string, id: string, timeoutMs: number): Promise<string> {
    const stub = this.config.env.QUESTIONS.get(this.config.env.QUESTIONS.idFromName(sessionId))
    return stub.ask(id, timeoutMs)
  }
}
