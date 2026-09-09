import assert from "node:assert/strict"
import test from "node:test"
import { Context, Service } from "@deepseek-ai/cordis"

test("official cordis mounts a service without Node APIs", async () => {
  const ctx = new Context()
  class Ping extends Service {
    constructor(context: Context) {
      super(context, "ping")
    }
    pong() {
      return "pong"
    }
  }
  await ctx.plugin(Ping)
  assert.equal((ctx as Context & { ping: Ping }).ping.pong(), "pong")
  await ctx.fiber.dispose()
})
