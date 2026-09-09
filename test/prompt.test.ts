import assert from "node:assert/strict"
import test from "node:test"
import { Context } from "@deepseek-ai/cordis"
import { SystemPromptService } from "../src/plugins/system-prompt.ts"

test("systemPrompt sections assemble in order and unwind with the fiber", async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPromptService)
  const typed = ctx as Context & { systemPrompt: SystemPromptService }
  typed.systemPrompt.section({ name: "b", order: 20, text: () => "B" })
  typed.systemPrompt.section({ name: "a", order: 10, text: () => "A" })
  assert.equal(typed.systemPrompt.assemble(), "A\n\nB")
  await ctx.fiber.dispose()
})
