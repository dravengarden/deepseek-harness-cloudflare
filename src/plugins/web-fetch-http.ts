import type { Context } from "@deepseek-ai/cordis"
import { htmlToText } from "../lib/html.ts"
import { assertPublicHttpUrl } from "../lib/ssrf.ts"
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from "./web.ts"

const FETCH_MAX_CHARS = 24_000

export const name = "web-fetch-http"
export const inject = ["web"]

export function apply(ctx: Context): void {
  ctx.web.registerFetchProvider({
    id: "http",
    available: () => true,
    async fetch(request: WebFetchRequest): Promise<WebFetchResult> {
      const url = assertPublicHttpUrl(request.url)
      const response = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: request.signal ?? null,
        headers: { "User-Agent": "deepseek-harness-cloudflare/0.1" },
      })
      const contentType = response.headers.get("content-type") ?? ""
      const raw = await response.text()
      const decoded = contentType.includes("html") ? htmlToText(raw, FETCH_MAX_CHARS) : raw
      const truncated = decoded.length > FETCH_MAX_CHARS
      return {
        url: response.url || url.toString(),
        status: response.status,
        body: truncated ? `${decoded.slice(0, FETCH_MAX_CHARS)}\n…[truncated]` : decoded,
        truncated,
      }
    },
  })
}
