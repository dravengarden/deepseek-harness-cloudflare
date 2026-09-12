import { DurableObject } from "cloudflare:workers"
import type { Context } from "@deepseek-ai/cordis"
import { composeHarness } from "./compose.ts"
import { log } from "./lib/log.ts"
import { resolveDeepseekModel } from "./lib/model.ts"
import { sseStream } from "./lib/sse.ts"
import type { SqlStorage } from "./sql.ts"
import type { Env } from "./types.ts"

export class HarnessObject extends DurableObject<Env> {
  private harness: Context | undefined

  private identityKey(): string {
    return this.ctx.id.name ?? "owner"
  }

  private async context(): Promise<Context> {
    const identityKey = this.identityKey()
    const existing = this.harness
    if (existing) return existing
    const composed = await this.ctx.blockConcurrencyWhile(async () => {
      if (this.harness) return this.harness
      const started = Date.now()
      const next = await composeHarness(this.env, this.ctx.storage.sql as SqlStorage, {
        identityKey,
        armAlarm: (at) => {
          void this.ctx.storage.setAlarm(at)
        },
      })
      log({
        level: "info",
        msg: "composeHarness after hibernation",
        identityKey,
        doClass: "HarnessObject",
        elapsedMs: Date.now() - started,
      })
      return next
    })
    this.harness = composed
    return composed
  }

  async alarm(): Promise<void> {
    const identityKey = this.identityKey()
    const started = Date.now()
    const ctx = await this.context()
    const due = await ctx.schedule.fireDue(Date.now())
    log({
      level: "info",
      msg: "schedule alarm fire",
      identityKey,
      sessionId: due[0]?.sessionId,
      doClass: "HarnessObject",
      elapsedMs: Date.now() - started,
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const identityKey = this.identityKey()
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
        model: resolveDeepseekModel(this.env),
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

    if (request.method === "DELETE" && sessionMatch) {
      const sessionId = sessionMatch[1]!
      agentLoop.cancel(sessionId)
      if (!sessions.remove(sessionId)) return jsonError("session not found", 404)
      log({
        level: "info",
        msg: "session delete",
        identityKey,
        sessionId,
        route: url.pathname,
        doClass: "HarnessObject",
      })
      return Response.json({ ok: true })
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
      const sessionId = cancelMatch[1]!
      agentLoop.cancel(sessionId)
      log({
        level: "info",
        msg: "turn cancel",
        identityKey,
        sessionId,
        route: url.pathname,
        doClass: "HarnessObject",
      })
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
              return turnStream(identityKey, session.id, url.pathname, (send) => agentLoop.run(session.id, rest, send))
            }
            return Response.json({ result })
          } catch (error) {
            return jsonError(error instanceof Error ? error.message : String(error), 400)
          }
        }
      }
      return turnStream(identityKey, session.id, url.pathname, (send) => agentLoop.run(session.id, message, send))
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

function turnStream(
  identityKey: string,
  sessionId: string,
  route: string,
  run: (send: (event: unknown) => void) => Promise<void>,
): Response {
  const stream = sseStream(async (send) => {
    const started = Date.now()
    log({ level: "info", msg: "turn start", identityKey, sessionId, route, doClass: "HarnessObject" })
    try {
      await run(send)
      log({
        level: "info",
        msg: "turn end",
        identityKey,
        sessionId,
        route,
        doClass: "HarnessObject",
        elapsedMs: Date.now() - started,
      })
    } catch (error) {
      log({
        level: "error",
        msg: "turn end",
        identityKey,
        sessionId,
        route,
        doClass: "HarnessObject",
        elapsedMs: Date.now() - started,
        err: error,
      })
      throw error
    }
  })
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  })
}
