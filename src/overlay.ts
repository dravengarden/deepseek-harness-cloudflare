import type { Env } from "./types.ts"

export const OVERLAY_HEADER = "x-dsh-overlay"

const encoder = new TextEncoder()

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value))
}

export async function overlayKeyMatches(expected: string, candidate: string): Promise<boolean> {
  if (!expected || !candidate) return false
  const [left, right] = await Promise.all([sha256(expected), sha256(candidate)])
  if (left.byteLength !== right.byteLength) return false
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Fail closed unless LOCAL_DEV or the overlay header matches. */
export async function overlayBlocked(request: Request, env: Env): Promise<Response | null> {
  if (env.LOCAL_DEV) return null
  const expected = (env.DSH_OVERLAY_KEY ?? "").trim()
  if (!expected) {
    return new Response("internal only", { status: 403, headers: { "cache-control": "no-store" } })
  }
  const got = (request.headers.get(OVERLAY_HEADER) ?? "").trim()
  if (!(await overlayKeyMatches(expected, got))) {
    return new Response("internal only", { status: 403, headers: { "cache-control": "no-store" } })
  }
  return null
}
