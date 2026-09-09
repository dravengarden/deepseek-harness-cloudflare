import assert from "node:assert/strict"
import test from "node:test"
import { isSkillName, parseSkillMd, renderSkillContent } from "../src/lib/skill-md.ts"
import { deriveMessages } from "../src/lib/derive-messages.ts"
import type { SessionEvent } from "../src/types.ts"

test("skill names are kebab-case", () => {
  assert.equal(isSkillName("research-briefing"), true)
  assert.equal(isSkillName("Nope"), false)
  assert.equal(isSkillName("/foo"), false)
})

test("parseSkillMd reads frontmatter invocation flags", () => {
  const parsed = parseSkillMd(`---
name: research-briefing
description: Write a cited briefing
disable-model-invocation: false
user-invocable: true
---
Do the work.
`, "fallback")
  assert.equal(parsed.name, "research-briefing")
  assert.equal(parsed.description, "Write a cited briefing")
  assert.equal(parsed.body, "Do the work.")
  assert.equal(parsed.modelInvocable, true)
  assert.equal(parsed.userInvocable, true)
})

test("renderSkillContent wraps instructions", () => {
  const text = renderSkillContent("research-briefing", "Hello")
  assert.match(text, /<skill_content name="research-briefing">/)
  assert.match(text, /<skill_instructions>\nHello\n/)
})

test("deriveMessages keeps skill catalog and inject as user content", () => {
  const events: SessionEvent[] = [
    { type: "skill/catalog", payload: { content: "catalog", digest: "a" }, seq: 1, createdAt: 1 },
    { type: "user/message", payload: { content: "go" }, seq: 2, createdAt: 2 },
    { type: "skill/inject", payload: { name: "research-briefing", content: "<skill_content>" }, seq: 3, createdAt: 3 },
  ]
  const messages = deriveMessages(events)
  assert.deepEqual(messages.map((message) => message.content), ["catalog", "go", "<skill_content>"])
})
