import assert from "node:assert/strict"
import test from "node:test"
import { IdentityError, identityErrorResponse, identityKey, identityMode, type Identity } from "../src/identity.ts"
import type { Env } from "../src/types.ts"

function env(partial: {
  IDENTITY_MODE?: string
  LEGACY_OWNER_EMAIL?: string
  LEGACY_OWNER_SUB?: string
} = {}): Env {
  return partial as Env
}

const access: Identity = {
  email: "alice@example.com",
  sub: "access-sub-1",
  source: "access",
}

const accessKey: Identity = {
  email: "owner",
  source: "key",
}

test("identityMode is per-user only for exact IDENTITY_MODE=per-user", () => {
  assert.equal(identityMode(env()), "shared-owner")
  assert.equal(identityMode(env({ IDENTITY_MODE: "shared-owner" })), "shared-owner")
  assert.equal(identityMode(env({ IDENTITY_MODE: "per-user" })), "per-user")
  for (const mode of ["Per-User", "per_user", "peruser", "typo"]) {
    assert.equal(identityMode(env({ IDENTITY_MODE: mode })), "shared-owner")
  }
})

test("unset IDENTITY_MODE is owner for Access and access-key", () => {
  assert.equal(identityKey(access, env()), "owner")
  assert.equal(identityKey(accessKey, env()), "owner")
})

test("IDENTITY_MODE=shared-owner is owner", () => {
  const shared = env({ IDENTITY_MODE: "shared-owner" })
  assert.equal(identityKey(access, shared), "owner")
  assert.equal(identityKey(accessKey, shared), "owner")
})

test("unknown IDENTITY_MODE stays owner", () => {
  for (const mode of ["Per-User", "per_user", "peruser", "typo"]) {
    assert.equal(identityKey(access, env({ IDENTITY_MODE: mode })), "owner")
    assert.equal(identityKey(accessKey, env({ IDENTITY_MODE: mode })), "owner")
  }
})

test("IDENTITY_MODE=per-user + Access + sub is user:<sub>", () => {
  assert.equal(identityKey(access, env({ IDENTITY_MODE: "per-user" })), "user:access-sub-1")
})

test("IDENTITY_MODE=per-user + Access missing sub throws IdentityError", () => {
  assert.throws(
    () => identityKey({ email: "alice@example.com", source: "access" }, env({ IDENTITY_MODE: "per-user" })),
    IdentityError,
  )
})

test("IDENTITY_MODE=per-user + LEGACY_OWNER_EMAIL matches case-insensitively", () => {
  assert.equal(
    identityKey(
      { email: "Alice@Example.COM", sub: "other-sub", source: "access" },
      env({ IDENTITY_MODE: "per-user", LEGACY_OWNER_EMAIL: "alice@example.com" }),
    ),
    "owner",
  )
})

test("IDENTITY_MODE=per-user + LEGACY_OWNER_SUB match is owner", () => {
  assert.equal(
    identityKey(access, env({ IDENTITY_MODE: "per-user", LEGACY_OWNER_SUB: "access-sub-1" })),
    "owner",
  )
})

test("IDENTITY_MODE=per-user + access-key source is local", () => {
  assert.equal(identityKey(accessKey, env({ IDENTITY_MODE: "per-user" })), "local")
})

test("email is never used as tenant id when sub is present", () => {
  const key = identityKey(
    { email: "alice@example.com", sub: "stable-sub", source: "access" },
    env({ IDENTITY_MODE: "per-user" }),
  )
  assert.equal(key, "user:stable-sub")
  assert.equal(key.includes("alice"), false)
  assert.equal(key.includes("@"), false)
})

test("IdentityError maps to 403 JSON", async () => {
  const response = identityErrorResponse(new IdentityError("Access JWT missing sub"))
  assert.ok(response)
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: "Access JWT missing sub" })
})

test("identityErrorResponse ignores other errors", () => {
  assert.equal(identityErrorResponse(new Error("boom")), undefined)
  assert.equal(identityErrorResponse("boom"), undefined)
})
