import type { Env } from "./types.ts"

export type Identity = {
  email: string
  sub?: string
  source: "access" | "key"
}

export function identityKey(identity: Identity, env: Env): string {
  // Only exact "per-user" splits objects. Typos must not leave "owner".
  if (env.IDENTITY_MODE !== "per-user") return "owner"
  if (identity.source === "key") return "local"
  if (env.LEGACY_OWNER_SUB && identity.sub === env.LEGACY_OWNER_SUB) return "owner"
  if (env.LEGACY_OWNER_EMAIL && identity.email.toLowerCase() === env.LEGACY_OWNER_EMAIL.toLowerCase()) {
    return "owner"
  }
  // Production per-user: sub is the stable Access subject. Email is display-only.
  if (identity.source === "access" && !identity.sub) {
    throw new IdentityError("Access JWT missing sub")
  }
  return `user:${identity.sub}`
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IdentityError"
  }
}

export function identityErrorResponse(error: unknown): Response | undefined {
  if (error instanceof IdentityError) {
    return Response.json({ error: error.message }, { status: 403 })
  }
}
