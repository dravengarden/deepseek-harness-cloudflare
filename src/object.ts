import { DurableObject } from "cloudflare:workers"
import type { Context } from "@deepseek-ai/cordis"
import { composeHarness } from "./compose.ts"
import { sseStream } from "./lib/sse.ts"
import type { SqlStorage } from "./sql.ts"
import type { Env } from "./types.ts"

export class HarnessObject extends DurableObject<Env> {
  private harness: Context | undefined

  private async context(): Promise<Context> {
    const identityKey = this.ctx.id.name ?? "owner"
    const existing = this.harness
    if (existing) return existing
    const composed = await this.ctx.blockConcurrencyWhile(async () => {
      return this.harness ?? await composeHarness(this.env, this.ctx.storage.sql as SqlStorage, {
        identityKey,
        armAlarm: (at) => {
          void this.ctx.storage.setAlarm(at)
        },
      })
    })
    this.harness = composed
    return composed
  }

  async alarm(): Promise<void> {
    const ctx = await this.context()
    await ctx.schedule.fireDue(Date.now())
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const ctx = await this.context()
    const { sessions, agentLoop, commands } = ctx

    if (request.method === "GET" && url.pathname === "/api/sessions") {
      return Response.json({ sessions: sessions.list() })
    }

    if (request.method === "GET" && url.pathname === "/api/commands") {
      return Response.json({ commands: commands.list().map((command) => ({ name: command.name, description: command.description })) })
    }

    if (request.method === "GET" && url.pathname === "/api/settings") {
      return Response.json({
        permission: ctx.permissions.preset(),
        model: this.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      })
    }

    if (request.method === "PUT" && url.pathname === "/api/settings") {
      const body = await readJson(request)
      if (body.permission === "workspace-write" || body.permission === "danger-full-access") {
        ctx.permissions.setPreset(body.permission)
      }
      return Response.json({ permission: ctx.permissions.preset() })
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const body = await readJson(request)
      const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled"
      return Response.json({ session: sessions.create(title).record }, { status: 201 })
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
    if (request.method === "GET" && sessionMatch) {
      const session = sessions.get(sessionMatch[1]!)
      if (!session) return jsonError("session not found", 404)
      return Response.json({ session: session.record, events: session.events() })
    }

    const forkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/fork$/)
    if (request.method === "POST" && forkMatch) {
      const body = await readJson(request)
      const boundary = typeof body.boundary === "number" ? body.boundary : undefined
      try {
        const child = sessions.fork(forkMatch[1]!, boundary)
        return Response.json({ session: child.record }, { status: 201 })
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    const cancelMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cancel$/)
    if (request.method === "POST" && cancelMatch) {
      agentLoop.cancel(cancelMatch[1]!)
      return Response.json({ ok: true })
    }

    const commandMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/command$/)
    if (request.method === "POST" && commandMatch) {
      const session = sessions.get(commandMatch[1]!)
      if (!session) return jsonError("session not found", 404)
      const body = await readJson(request)
      const command = typeof body.command === "string" ? body.command : ""
      try {
        const result = await commands.run(command, session.id)
        return Response.json({ result })
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    const turnMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/turn$/)
    if (request.method === "POST" && turnMatch) {
      const session = sessions.get(turnMatch[1]!)
      if (!session) return jsonError("session not found", 404)
      const body = await readJson(request)
      const message = typeof body.message === "string" ? body.message.trim() : ""
      if (!message) return jsonError("message is required", 400)
      if (message.startsWith("/")) {
        const name = message.slice(1).split(/\s+/, 1)[0] ?? ""
        if (commands.has(name)) {
          try {
            const result = await commands.run(message, session.id)
            const rest = message.slice(name.length + 1).trim()
            if (name === "plan" && rest && rest !== "off") {
              const stream = sseStream(async (send) => {
                await agentLoop.run(session.id, rest, send)
              })
              return new Response(stream, {
                headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
              })
            }
            return Response.json({ result })
          } catch (error) {
            return jsonError(error instanceof Error ? error.message : String(error), 400)
          }
        }
      }
      const stream = sseStream(async (send) => {
        await agentLoop.run(session.id, message, send)
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      })
    }

    return jsonError("not found", 404)
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}
