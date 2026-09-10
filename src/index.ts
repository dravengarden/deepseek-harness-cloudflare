import { accessConfigured, accessLogoutUrl } from "./access.ts"
import {
  accessKeyMatches,
  clearCookieHeader,
  cookieHeader,
  resolveIdentity,
} from "./auth.ts"
import { identityErrorResponse, identityKey, identityMode } from "./identity.ts"
import { HarnessObject } from "./object.ts"
import type { Env } from "./types.ts"

export { ControlMailbox } from "./mailbox.ts"
export { QuestionGate } from "./gate.ts"
export { Sandbox } from "./sandbox.ts"

export { composeHarness } from "./compose.ts"
export { HarnessObject }
export { Context, Service } from "./host.ts"
export type { Plugin } from "./host.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const secure = url.protocol === "https:"

    if (request.method === "POST" && url.pathname === "/api/login") {
      if (accessConfigured(env)) {
        return Response.json({ error: "use Cloudflare Access to sign in" }, { status: 400 })
      }
      const body = await request.json().catch(() => ({})) as { accessKey?: string }
      const key = body.accessKey ?? ""
      if (!(await accessKeyMatches(env, key))) {
        return Response.json({ error: "invalid access key" }, { status: 401 })
      }
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": cookieHeader(key, secure) } },
      )
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      if (accessConfigured(env)) {
        return Response.json({ ok: true, logout: accessLogoutUrl(env) })
      }
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": clearCookieHeader(secure) } },
      )
    }

    if (url.pathname.startsWith("/api/")) {
      const identity = await resolveIdentity(request, env)
      if (!identity) {
        return Response.json({ error: "unauthorized" }, { status: 401 })
      }
      let key: string
      try {
        key = identityKey(identity, env)
      } catch (error) {
        const forbidden = identityErrorResponse(error)
        if (forbidden) return forbidden
        throw error
      }
      if (url.pathname === "/api/me") {
        return Response.json({
          ok: true,
          model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
          email: identity.email,
          auth: identity.source,
          identityKey: key,
          identityMode: identityMode(env),
          ...(identity.sub ? { sub: identity.sub } : {}),
        })
      }
      const mailbox = env.MAILBOX.getByName(key)
      const harness = env.HARNESS.getByName(key)
      const answerMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/answer$/)
      if (request.method === "POST" && answerMatch) {
        const body = await request.json().catch(() => ({})) as { id?: string; answer?: string }
        const id = body.id ?? ""
        const answer = body.answer ?? ""
        if (!id || !answer) return Response.json({ error: "id and answer are required" }, { status: 400 })
        const ok = await mailbox.answer(answerMatch[1]!, id, answer)
        return Response.json({ ok })
      }
      return harness.fetch(request)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
