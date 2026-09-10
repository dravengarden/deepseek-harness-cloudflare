import assert from "node:assert/strict"
import test from "node:test"
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export class DurableObject {}",
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const { MailboxWaiters } = await import("../src/mailbox.ts")

test("answer completes", async () => {
  const waiters = new MailboxWaiters()
  const pending = waiters.ask("ses", "q1", 60_000)
  assert.equal(waiters.answer("ses", "q1", "yes"), true)
  assert.equal(await pending, "yes")
})

test("abort() rejects before TIMEOUT_MS", async () => {
  const waiters = new MailboxWaiters()
  const started = Date.now()
  const pending = waiters.ask("ses", "q1", 60_000)
  assert.equal(waiters.abort("ses", "q1"), true)
  await assert.rejects(pending, { message: "ask_user_question cancelled" })
  assert.ok(Date.now() - started < 5_000)
})

test("abort with no waiter returns false", () => {
  const waiters = new MailboxWaiters()
  assert.equal(waiters.abort("ses", "q1"), false)
})

test("timeout rejects", async () => {
  const waiters = new MailboxWaiters()
  await assert.rejects(waiters.ask("ses", "q1", 20), { message: "ask_user_question timed out" })
})

test("duplicate id throws", async () => {
  const waiters = new MailboxWaiters()
  const first = waiters.ask("ses", "q1", 60_000)
  assert.throws(() => {
    void waiters.ask("ses", "q1", 60_000)
  }, { message: "duplicate ask id" })
  assert.equal(waiters.abort("ses", "q1"), true)
  await assert.rejects(first, { message: "ask_user_question cancelled" })
})

test("a new ask after abort is not auto-cancelled", async () => {
  const waiters = new MailboxWaiters()
  const first = waiters.ask("ses", "q1", 60_000)
  assert.equal(waiters.abort("ses", "q1"), true)
  await assert.rejects(first, { message: "ask_user_question cancelled" })

  const second = waiters.ask("ses", "q1", 60_000)
  assert.equal(waiters.answer("ses", "q1", "hello"), true)
  assert.equal(await second, "hello")
})
