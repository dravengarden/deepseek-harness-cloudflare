import { Service, type Context } from "@deepseek-ai/cordis"
import type { LlmDelta, LlmRequest } from "../types.ts"

export interface LlmAdapter {
  id: string
  stream(request: LlmRequest): AsyncGenerator<LlmDelta>
}

export class LlmRuntime extends Service {
  private adapter: LlmAdapter | undefined

  constructor(ctx: Context) {
    super(ctx, "llm")
  }

  registerAdapter(adapter: LlmAdapter): void {
    this.adapter = adapter
  }

  async *stream(request: LlmRequest): AsyncGenerator<LlmDelta> {
    if (!this.adapter) throw new Error("no llm adapter registered")
    yield* this.adapter.stream(request)
  }

  async complete(request: LlmRequest): Promise<string> {
    let text = ""
    for await (const delta of this.stream(request)) {
      if (delta.kind === "text" && delta.text) text += delta.text
    }
    return text
  }
}
