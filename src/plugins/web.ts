import { Service, type Context } from "@deepseek-ai/cordis"
import type { WebSearchResult } from "../types.ts"

export interface WebSearchRequest {
  query: string
  maxResults?: number
  signal?: AbortSignal
}

export interface WebFetchRequest {
  url: string
  signal?: AbortSignal
}

export interface WebFetchResult {
  url: string
  status: number
  body: string
  truncated: boolean
}

export interface WebSearchProvider {
  id: string
  available(): boolean
  search(request: WebSearchRequest): Promise<WebSearchResult>
}

export interface WebFetchProvider {
  id: string
  available(): boolean
  fetch(request: WebFetchRequest): Promise<WebFetchResult>
}

export class WebRuntime extends Service {
  private readonly searchProviders = new Map<string, WebSearchProvider>()
  private readonly fetchProviders = new Map<string, WebFetchProvider>()

  constructor(ctx: Context) {
    super(ctx, "web")
  }

  registerSearchProvider(provider: WebSearchProvider): void {
    this.searchProviders.set(provider.id, provider)
  }

  registerFetchProvider(provider: WebFetchProvider): void {
    this.fetchProviders.set(provider.id, provider)
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult> {
    const provider = pick(this.searchProviders, "search")
    const result = await provider.search(request)
    const maxResults = request.maxResults ?? 8
    if (result.sources.length <= maxResults) return result
    return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
  }

  async fetch(request: WebFetchRequest): Promise<WebFetchResult> {
    return pick(this.fetchProviders, "fetch").fetch(request)
  }
}

function pick<T extends { available(): boolean }>(providers: Map<string, T>, kind: string): T {
  const usable = [...providers.values()].filter((provider) => provider.available())
  if (usable.length === 0) throw new Error(`WEB_PROVIDER_UNAVAILABLE: no ${kind} provider`)
  if (usable.length > 1) throw new Error(`WEB_PROVIDER_AMBIGUOUS: ${usable.length} ${kind} providers`)
  return usable[0]!
}
