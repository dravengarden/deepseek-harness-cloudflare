import { accessConfigured, accessLogoutUrl } from "./access.ts"
import {
  accessKeyMatches,
  clearCookieHeader,
  cookieHeader,
  resolveIdentity,
} from "./auth.ts"
import { identityErrorResponse, identityKey, identityMode } from "./identity.ts"
import { log } from "./lib/log.ts"
import { resolveDeepseekModel } from "./lib/model.ts"
import { overlayBlocked } from "./overlay.ts"
import { HarnessObject } from "./object.ts"
import type { Env } from "./types.ts"

export { ControlMailbox } from "./mailbox.ts"
export { Sandbox } from "./sandbox.ts"

export { composeHarness } from "./compose.ts"
export { HarnessObject }
export { Context, Service } from "./host.ts"
export type { Plugin } from "./host.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await overlayBlocked(request, env)
    if (denied) return withSecurityHeaders(denied)

    const url = new URL(request.url)
    const secure = url.protocol === "https:"

    if (request.method === "POST" && url.pathname === "/api/login") {
      if (accessConfigured(env)) {
        return withSecurityHeaders(Response.json({ error: "use Cloudflare Access to sign in" }, { status: 400 }))
      }
      const body = await request.json().catch(() => ({})) as { accessKey?: string }
      const key = (body.accessKey ?? "").trim()
      if (!(await accessKeyMatches(env, key))) {
        log({ level: "error", msg: "unauthorized", route: url.pathname, err: "invalid access key" })
        return withSecurityHeaders(Response.json({ error: "invalid access key" }, { status: 401 }))
      }
      return withSecurityHeaders(Response.json(
        { ok: true },
        { headers: { "Set-Cookie": cookieHeader(key, secure) } },
      ))
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      if (accessConfigured(env)) {
        return withSecurityHeaders(Response.json({ ok: true, logout: accessLogoutUrl(env) }))
      }
      return withSecurityHeaders(Response.json(
        { ok: true },
        { headers: { "Set-Cookie": clearCookieHeader(secure) } },
      ))
    }

    if (url.pathname === "/robots.txt") {
      return withSecurityHeaders(new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }))
    }

    if (url.pathname.startsWith("/api/")) {
      const identity = await resolveIdentity(request, env)
      if (!identity) {
        log({ level: "error", msg: "unauthorized", route: url.pathname, err: "no jwt / bad key" })
        return withSecurityHeaders(Response.json({ error: "unauthorized" }, { status: 401 }))
      }
      let key: string
      try {
        key = identityKey(identity, env)
      } catch (error) {
        const forbidden = identityErrorResponse(error)
        if (forbidden) return withSecurityHeaders(forbidden)
        throw error
      }
      if (key.startsWith("user:")) {
        log({
          level: "info",
          msg: "identity route",
          identityKey: key,
          route: url.pathname,
          mode: "per-user",
        })
      }
      if (url.pathname === "/api/me") {
        return withSecurityHeaders(Response.json({
          ok: true,
          model: resolveDeepseekModel(env),
          email: identity.email,
          auth: identity.source,
          identityKey: key,
          identityMode: identityMode(env),
          ...(identity.sub ? { sub: identity.sub } : {}),
        }))
      }
      const mailbox = env.MAILBOX.getByName(key)
      const harness = env.HARNESS.getByName(key)
      const answerMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/answer$/)
      if (request.method === "POST" && answerMatch) {
        const body = await request.json().catch(() => ({})) as { id?: string; answer?: string }
        const id = body.id ?? ""
        const answer = body.answer ?? ""
        if (!id || !answer) {
          return withSecurityHeaders(Response.json({ error: "id and answer are required" }, { status: 400 }))
        }
        const ok = await mailbox.answer(answerMatch[1]!, id, answer)
        return withSecurityHeaders(Response.json({ ok }))
      }
      return withSecurityHeaders(await harness.fetch(request))
    }

    return withSecurityHeaders(await serveAssets(request, env))
  },
} satisfies ExportedHandler<Env>

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("X-Frame-Options", "DENY")
  headers.set("Referrer-Policy", "no-referrer")
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const UI_COOKIE = "dsh_ui"

function uiCookie(header: string | null): "mobile" | "desktop" | null {
  const match = header?.match(/(?:^|;\s*)dsh_ui=(mobile|desktop)/)
  return (match?.[1] as "mobile" | "desktop" | undefined) ?? null
}

function looksMobile(ua: string): boolean {
  return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

function setUiCookie(kind: "mobile" | "desktop"): string {
  return `${UI_COOKIE}=${kind}; Path=/; Max-Age=31536000; SameSite=Lax`
}

async function serveAssets(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return env.ASSETS.fetch(request)
  }
  const url = new URL(request.url)
  const uiParam = url.searchParams.get("ui")
  const cookie = uiCookie(request.headers.get("Cookie"))
  const mobileUa = looksMobile(request.headers.get("User-Agent") ?? "")
  const preferMobile =
    uiParam === "mobile" ||
    (uiParam !== "desktop" && (cookie === "mobile" || (cookie !== "desktop" && mobileUa)))

  if (url.pathname === "/" && preferMobile) {
    const headers = new Headers({ Location: "/m" })
    if (uiParam === "mobile") headers.set("Set-Cookie", setUiCookie("mobile"))
    return new Response(null, { status: 302, headers })
  }

  if (url.pathname === "/" && uiParam === "desktop") {
    const asset = await env.ASSETS.fetch(request)
    const headers = new Headers(asset.headers)
    headers.append("Set-Cookie", setUiCookie("desktop"))
    return new Response(asset.body, { status: asset.status, headers })
  }

  if (url.pathname === "/m" || url.pathname === "/m/") {
    const asset = await env.ASSETS.fetch(
      new Request(new URL("/m.html", url).toString(), {
        method: request.method,
        headers: request.headers,
      }),
    )
    const headers = new Headers(asset.headers)
    if (uiParam === "mobile") headers.append("Set-Cookie", setUiCookie("mobile"))
    return new Response(asset.body, { status: asset.status, headers })
  }

  return env.ASSETS.fetch(request)
}
