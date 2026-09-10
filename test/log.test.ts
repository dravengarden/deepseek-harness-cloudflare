import assert from "node:assert/strict"
import test from "node:test"
import { log, truncateForLog } from "../src/lib/log.ts"

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc"

function capture(fn: () => void): { logs: string[]; errors: string[] } {
  const logs: string[] = []
  const errors: string[] = []
  const logFn = console.log
  const errFn = console.error
  console.log = (...args: unknown[]) => { logs.push(String(args[0])) }
  console.error = (...args: unknown[]) => { errors.push(String(args[0])) }
  try {
    fn()
  } finally {
    console.log = logFn
    console.error = errFn
  }
  return { logs, errors }
}

test("log writes canonical JSON fields", () => {
  const { logs, errors } = capture(() => {
    log({
      msg: "turn start",
      identityKey: "user:abc",
      sessionId: "ses_1",
      route: "/api/sessions/ses_1/turn",
      doClass: "HarnessObject",
      elapsedMs: 12,
    })
  })
  assert.equal(errors.length, 0)
  assert.equal(logs.length, 1)
  const row = JSON.parse(logs[0]!)
  assert.equal(row.level, "info")
  assert.equal(row.msg, "turn start")
  assert.equal(row.identityKey, "user:abc")
  assert.equal(row.sessionId, "ses_1")
  assert.equal(row.route, "/api/sessions/ses_1/turn")
  assert.equal(row.doClass, "HarnessObject")
  assert.equal(row.elapsedMs, 12)
})

test("error level uses console.error", () => {
  const { logs, errors } = capture(() => {
    log({ level: "error", msg: "unauthorized", route: "/api/sessions", err: "no jwt / bad key" })
  })
  assert.equal(logs.length, 0)
  assert.equal(errors.length, 1)
  const row = JSON.parse(errors[0]!)
  assert.equal(row.level, "error")
  assert.equal(row.msg, "unauthorized")
  assert.equal(row.err, "no jwt / bad key")
})

test("redacts access keys, API keys, and JWT-shaped strings", () => {
  const { errors } = capture(() => {
    log({
      level: "error",
      msg: `header ${JWT}`,
      accessKey: "super-secret",
      DEEPSEEK_API_KEY: "sk-secret",
      err: new Error(`Cf-Access-Jwt-Assertion ${JWT}`),
    })
  })
  const row = JSON.parse(errors[0]!)
  assert.equal(row.accessKey, "[redacted]")
  assert.equal(row.DEEPSEEK_API_KEY, "[redacted]")
  assert.equal(String(row.msg).includes(JWT), false)
  assert.equal(String(row.err).includes(JWT), false)
  assert.match(String(row.err), /\[redacted\]/)
})

test("truncates tool results in logs", () => {
  const content = "x".repeat(10_000)
  assert.ok(truncateForLog(content).length < content.length)
  const { logs } = capture(() => {
    log({ msg: "tool/result", content })
  })
  const row = JSON.parse(logs[0]!)
  assert.ok(String(row.content).length < 300)
  assert.ok(String(row.content).endsWith("…"))
})

test("does not dump objects such as env or request", () => {
  const { logs } = capture(() => {
    log({ msg: "identity route", env: { DEEPSEEK_API_KEY: "sk-secret" }, request: { headers: { "Cf-Access-Jwt-Assertion": JWT } } })
  })
  const row = JSON.parse(logs[0]!)
  assert.equal(row.env, undefined)
  assert.equal(row.request, undefined)
})
