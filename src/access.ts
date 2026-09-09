import { createRemoteJWKSet, jwtVerify } from "jose"
import type { Env } from "./types.ts"

export interface AccessIdentity {
  email: string
  sub?: string
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export function accessConfigured(env: Env): boolean {
  return Boolean(env.TEAM_DOMAIN && env.POLICY_AUD)
}

export function teamDomainUrl(env: Env): string {
  const raw = (env.TEAM_DOMAIN ?? "").replace(/\/$/, "")
  if (!raw) return ""
  return raw.startsWith("http") ? raw : `https://${raw}`
}

export async function verifyAccessJwt(request: Request, env: Env): Promise<AccessIdentity | null> {
  if (!accessConfigured(env)) return null
  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? readNamedCookie(request, "CF_Authorization")
  if (!token) return null
  const issuer = teamDomainUrl(env)
  let jwks = jwksCache.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    jwksCache.set(issuer, jwks)
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.POLICY_AUD,
    })
    const email = typeof payload.email === "string" ? payload.email : ""
    const sub = typeof payload.sub === "string" ? payload.sub : undefined
    if (!email && !sub) return null
    return { email: email || "access-user", sub }
  } catch {
    return null
  }
}

export function accessLogoutUrl(env: Env): string {
  return `${teamDomainUrl(env)}/cdn-cgi/access/logout`
}

function readNamedCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return decodeURIComponent(rest.join("="))
  }
  return null
}
