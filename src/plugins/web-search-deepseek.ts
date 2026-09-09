import type { Context } from "@deepseek-ai/cordis"
import type { WebSearchResult, WebSource } from "../types.ts"
import type { WebSearchProvider, WebSearchRequest } from "./web.ts"

export const DEEPSEEK_PROVIDER_ID = "deepseek-official"
export const DEEPSEEK_DEFAULT_SEARCH_BASE_URL = "https://api.deepseek.com/anthropic/v1"

export interface DeepSeekSearchConfig {
  apiKey: string
  model: string
  baseURL?: string
  maxUses?: number
}

export const name = "web-search-deepseek"
export const inject = ["web"]

export function apply(ctx: Context, config: DeepSeekSearchConfig): void {
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(config))
}

class DeepSeekSearchProvider implements WebSearchProvider {
  readonly id = DEEPSEEK_PROVIDER_ID

  constructor(private readonly config: DeepSeekSearchConfig) {}

  available(): boolean {
    return Boolean(this.config.apiKey)
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult> {
    const base = (this.config.baseURL ?? DEEPSEEK_DEFAULT_SEARCH_BASE_URL).replace(/\/$/, "")
    const response = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: request.query }],
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: this.config.maxUses ?? 5,
          },
        ],
      }),
      signal: request.signal ?? null,
    })
    const body = await response.json() as {
      error?: { message?: string }
      content?: Array<{
        type: string
        text?: string
        content?: Array<{ type?: string; title?: string; url?: string; snippet?: string }>
      }>
    }
    if (!response.ok) {
      throw new Error(body.error?.message ?? `web_search failed: ${response.status}`)
    }

    const sources: WebSource[] = []
    const answers: string[] = []
    for (const block of body.content ?? []) {
      if (block.type === "text" && block.text) answers.push(block.text)
      if (block.type === "web_search_tool_result") {
        for (const item of block.content ?? []) {
          if (item.url) {
            sources.push({
              title: item.title || item.url,
              url: item.url,
              snippet: item.snippet,
            })
          }
        }
      }
    }
    return {
      query: request.query,
      answer: answers.join("\n\n") || undefined,
      sources,
    }
  }
}
