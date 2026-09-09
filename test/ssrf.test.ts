import assert from "node:assert/strict"
import test from "node:test"
import { assertPublicHttpUrl, FetchPolicyError } from "../src/lib/ssrf.ts"
import { htmlToText } from "../src/lib/html.ts"

test("accepts public https urls", () => {
  const url = assertPublicHttpUrl("https://example.com/path")
  assert.equal(url.hostname, "example.com")
})

test("rejects credentials, localhost, and ip literals", () => {
  const bad = [
    "http://user:pass@example.com",
    "http://localhost/secret",
    "http://127.0.0.1/",
    "http://192.168.1.9/",
    "ftp://example.com",
  ]
  for (const url of bad) {
    assert.throws(() => assertPublicHttpUrl(url), FetchPolicyError)
  }
})

test("strips html to text", () => {
  const text = htmlToText("<html><script>alert(1)</script><p>Hello &amp; world</p></html>")
  assert.equal(text, "Hello & world")
})
