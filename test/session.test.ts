import assert from "node:assert/strict"
import test from "node:test"
import { deriveMessages } from "../src/lib/derive-messages.ts"
import type { SessionEvent } from "../src/types.ts"

test("deriveMessages projects user, assistant tool calls, and tool results", () => {
  const events: SessionEvent[] = [
    { type: "turn/start", payload: {}, seq: 1, createdAt: 1 },
    { type: "user/message", payload: { content: "search it" }, seq: 2, createdAt: 2 },
    {
      type: "assistant/message",
      payload: {
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: "{\"query\":\"x\"}" } }],
      },
      seq: 3,
      createdAt: 3,
    },
    { type: "tool/result", payload: { id: "call_1", name: "web_search", content: "{\"ok\":true}" }, seq: 4, createdAt: 4 },
    { type: "assistant/message", payload: { content: "done" }, seq: 5, createdAt: 5 },
    { type: "turn/end", payload: {}, seq: 6, createdAt: 6 },
  ]
  const messages = deriveMessages(events)
  assert.equal(messages.length, 4)
  assert.equal(messages[0]?.role, "user")
  assert.equal(messages[1]?.role, "assistant")
  assert.equal(messages[1]?.tool_calls?.[0]?.id, "call_1")
  assert.equal(messages[2]?.role, "tool")
  assert.equal(messages[2]?.tool_call_id, "call_1")
  assert.equal(messages[3]?.content, "done")
})

test("deriveMessages skips events covered by compaction/summary", () => {
  const events: SessionEvent[] = [
    { type: "user/message", payload: { content: "old" }, seq: 1, createdAt: 1 },
    { type: "assistant/message", payload: { content: "old answer" }, seq: 2, createdAt: 2 },
    { type: "compaction/summary", payload: { content: "summary", throughSeq: 2 }, seq: 3, createdAt: 3 },
    { type: "user/message", payload: { content: "new" }, seq: 4, createdAt: 4 },
  ]
  const messages = deriveMessages(events)
  assert.deepEqual(messages.map((message) => message.content), [
    "Conversation summary:\nsummary",
    "new",
  ])
})
