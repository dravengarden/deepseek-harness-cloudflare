import { accessConfigured, verifyAccessJwt } from "./access.ts"
import type { Env } from "./types.ts"

const COOKIE = "dsh_cf"
const encoder = new TextEncoder()

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value))
}

export async function accessKeyMatches(env: Env, candidate: string): Promise<boolean> {
  const expected = env.DSH_CF_ACCESS_KEY ?? ""
  if (!expected || !candidate) return false
  const [left, right] = await Promise.all([sha256(expected), sha256(candidate)])
  if (left.byteLength !== right.byteLength) return false
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export function readCookie(request: Request): string | null {
  const header = request.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === COOKIE) return decodeURIComponent(rest.join("="))
  }
  return null
}

export function cookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function clearCookieHeader(secure: boolean): string {
  const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export interface SessionIdentity {
  email: string
  sub?: string
  source: "access" | "key"
}

export async function resolveIdentity(request: Request, env: Env): Promise<SessionIdentity | null> {
  if (accessConfigured(env)) {
    const identity = await verifyAccessJwt(request, env)
    if (!identity) return null
    return { email: identity.email, sub: identity.sub, source: "access" }
  }
  const token = readCookie(request)
  if (!token) return null
  if (!(await accessKeyMatches(env, token))) return null
  return { email: "owner", source: "key" }
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  return (await resolveIdentity(request, env)) !== null
}
