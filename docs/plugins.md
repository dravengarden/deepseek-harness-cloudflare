# Writing plugins

This host is a Cordis application. Runtime shape:
[`architecture.md`](architecture.md). A plugin is a function, class, or
`{ name, inject, apply }` object, the same shapes official DeepSeek Harness
uses. Mount it from `composeHarness(..., { identityKey, plugins: [yours] })`
or add it to `src/compose.ts`.

```ts
import type { Context } from "@deepseek-ai/cordis"

export const name = "acme"
export const inject = ["tools", "systemPrompt", "commands"]

export function apply(ctx: Context) {
  ctx.systemPrompt.section({
    name: "acme",
    order: 50,
    text: () => "Acme-specific instructions.",
  })

  ctx.tools.register({
    name: "acme_lookup",
    description: "Look up an Acme record",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async execute(args) {
      return JSON.stringify({ id: args.id })
    },
  })

  ctx.commands.register({
    name: "acme",
    description: "Run an Acme command",
    async run(args, sessionId) {
      return `session ${sessionId}: ${args}`
    },
  })

  ctx.on("session/event", (sessionId, event) => {
    if (event.type === "turn/end") {
      ctx.logger.info("turn ended %s", sessionId)
    }
  })
}
```

## Seams plugins should use

| Service | For |
|---|---|
| `ctx.sessions` | append-only log, `get().deriveMessages()`, `fork()` |
| `ctx.agents` | live Agent handles (`id === session.id`) |
| `ctx.llm` | `stream` / `complete`; `registerAdapter` for another model |
| `ctx.web` | `registerSearchProvider` / `registerFetchProvider` |
| `ctx.tools` | model-facing tools; registrations unwind with the fiber |
| `ctx.systemPrompt` | ordered `section({ name, order, text })` |
| `ctx.commands` | `/name` commands |
| `ctx.settings` | per-namespace JSON documents in SQLite |
| `ctx.schedule` | Durable Object alarms |
| `ctx.skills` | skill catalog injected into the prompt |
| `ctx.compaction` | `/compact` and `compactNow` |
| `ctx.execution` | official Sandbox: bash, `/workspace` files, backup/restore |
| `ctx.subagents` | in-process spawn/fork child sessions |
| `ctx.questions` | `ask_user_question` wait (ControlMailbox ask / answer / abort) |
| `ctx.plan` | plan mode + `exit_plan_mode` |

Do not import Node APIs. Do not mount the official YAML Loader. The kernel is
`@deepseek-ai/cordis`; everything else in this repository is the Cloudflare
host implementing those seams.
