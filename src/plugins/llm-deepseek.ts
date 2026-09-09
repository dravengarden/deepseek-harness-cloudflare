import type { Context } from "@deepseek-ai/cordis"
import type { LlmDelta, LlmRequest, ToolCall } from "../types.ts"
import type { LlmAdapter } from "./llm.ts"

export interface DeepSeekLlmConfig {
  apiKey: string
  model: string
  baseURL: string
}

const DEFAULT_BASE_URL = "https://api.deepseek.com"

export const name = "llm-deepseek"
export const inject = ["llm"]

export function apply(ctx: Context, config: DeepSeekLlmConfig): void {
  ctx.llm.registerAdapter(new DeepSeekChatAdapter(config))
}

class DeepSeekChatAdapter implements LlmAdapter {
  readonly id = "deepseek-official"

  constructor(private readonly config: DeepSeekLlmConfig) {}

  async *stream(request: LlmRequest): AsyncGenerator<LlmDelta> {
    const base = this.config.baseURL.replace(/\/$/, "")
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        tools: request.tools.length ? request.tools : undefined,
        stream: true,
        thinking: { type: "enabled" },
      }),
      signal: request.signal ?? null,
    })
    if (!response.ok || !response.body) {
      const text = await response.text()
      throw new Error(`deepseek chat failed: ${response.status} ${text.slice(0, 400)}`)
    }

    const tools = new Map<number, ToolCall>()
    const decoder = new TextDecoder()
    let buffer = ""
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === "[DONE]") continue
        let parsed: {
          choices?: Array<{
            delta?: {
              content?: string | null
              reasoning_content?: string | null
              tool_calls?: Array<{
                index: number
                id?: string
                function?: { name?: string; arguments?: string }
              }>
            }
          }>
        }
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue
        if (delta.reasoning_content) yield { kind: "thinking", text: delta.reasoning_content }
        if (delta.content) yield { kind: "text", text: delta.content }
        for (const part of delta.tool_calls ?? []) {
          const current = tools.get(part.index) ?? {
            id: part.id ?? `call_${part.index}`,
            type: "function" as const,
            function: { name: "", arguments: "" },
          }
          if (part.id) current.id = part.id
          if (part.function?.name) current.function.name += part.function.name
          if (part.function?.arguments) current.function.arguments += part.function.arguments
          tools.set(part.index, current)
        }
      }
    }
    for (const call of [...tools.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1])) {
      yield { kind: "tool_call", toolCall: call }
    }
  }
}

export { DEFAULT_BASE_URL }
