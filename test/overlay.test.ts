import assert from "node:assert/strict"
import test from "node:test"
import { overlayBlocked, overlayKeyMatches } from "../src/overlay.ts"

test("overlayKeyMatches is true only for the exact secret", async () => {
  assert.equal(await overlayKeyMatches("secret", "secret"), true)
  assert.equal(await overlayKeyMatches("secret", "other"), false)
  assert.equal(await overlayKeyMatches("secret", ""), false)
  assert.equal(await overlayKeyMatches("", "secret"), false)
})

test("LOCAL_DEV skips the overlay gate", async () => {
  const blocked = await overlayBlocked(new Request("https://example/"), { LOCAL_DEV: "1" } as never)
  assert.equal(blocked, null)
})

test("missing overlay secret fail-closes", async () => {
  const blocked = await overlayBlocked(new Request("https://example/"), {} as never)
  assert.equal(blocked?.status, 403)
})

test("wrong header is 403; matching header passes", async () => {
  const env = { DSH_OVERLAY_KEY: "gate" } as never
  const denied = await overlayBlocked(new Request("https://example/"), env)
  assert.equal(denied?.status, 403)
  const ok = await overlayBlocked(
    new Request("https://example/", { headers: { "x-dsh-overlay": "gate" } }),
    env,
  )
  assert.equal(ok, null)
})
