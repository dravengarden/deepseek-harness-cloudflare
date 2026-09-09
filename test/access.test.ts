import assert from "node:assert/strict"
import test from "node:test"
import { accessConfigured, teamDomainUrl } from "../src/access.ts"

test("access is off without TEAM_DOMAIN and POLICY_AUD", () => {
  assert.equal(accessConfigured({} as never), false)
  assert.equal(accessConfigured({ TEAM_DOMAIN: "https://t.cloudflareaccess.com", POLICY_AUD: "aud" } as never), true)
})

test("teamDomainUrl adds https when missing", () => {
  assert.equal(teamDomainUrl({ TEAM_DOMAIN: "t.cloudflareaccess.com" } as never), "https://t.cloudflareaccess.com")
  assert.equal(teamDomainUrl({ TEAM_DOMAIN: "https://t.cloudflareaccess.com/" } as never), "https://t.cloudflareaccess.com")
})
