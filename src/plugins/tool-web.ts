import type { Context } from "@deepseek-ai/cordis"

export const name = "tool-web"
export const inject = ["tools", "web"]

export function apply(ctx: Context): void {
  ctx.tools.register({
    name: "web_search",
    description:
      "Search the public web. Pass one or more queries; returns an optional answer plus citeable sources.",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 4,
          description: "Search queries",
        },
        query: { type: "string", description: "Single query (alias for queries: [query])" },
      },
    },
    async execute(args, signal) {
      const queries = Array.isArray(args.queries)
        ? args.queries.map((item) => String(item).trim()).filter(Boolean)
        : String(args.query ?? "").trim()
          ? [String(args.query).trim()]
          : []
      if (queries.length === 0) return JSON.stringify({ error: "queries is required" })
      const results = []
      for (const query of queries.slice(0, 4)) {
        results.push(await ctx.web.search({ query, maxResults: 8, signal }))
      }
      return JSON.stringify(results.length === 1 ? results[0] : results)
    },
  })

  ctx.tools.register({
    name: "web_fetch",
    description: "Fetch a public http(s) URL and return extracted text.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL" },
      },
      required: ["url"],
    },
    async execute(args, signal) {
      const url = String(args.url ?? "").trim()
      if (!url) return JSON.stringify({ error: "url is required" })
      return JSON.stringify(await ctx.web.fetch({ url, signal }))
    },
  })
}
