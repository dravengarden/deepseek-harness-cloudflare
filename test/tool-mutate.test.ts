import assert from "node:assert/strict"
import test from "node:test"
import { toolMutates } from "../src/lib/tool-mutate.ts"
import { shQuote } from "../src/lib/shell-quote.ts"

test("glob, grep, and file reads do not mutate", () => {
  assert.equal(toolMutates("glob", { pattern: "**/*.md" }), false)
  assert.equal(toolMutates("grep", { pattern: "TODO" }), false)
  assert.equal(toolMutates("read_file", { path: "a.txt" }), false)
  assert.equal(toolMutates("list_dir"), false)
})

test("str_replace view is read-only; replace and create mutate", () => {
  assert.equal(toolMutates("str_replace_editor", { command: "view", path: "a" }), false)
  assert.equal(toolMutates("str_replace_editor", { command: "str_replace", path: "a" }), true)
  assert.equal(toolMutates("str_replace_editor", { command: "create", path: "a" }), true)
})

test("bash and writes mutate", () => {
  assert.equal(toolMutates("bash", { command: "ls" }), true)
  assert.equal(toolMutates("write_file"), true)
  assert.equal(toolMutates("delete_file"), true)
  assert.equal(toolMutates("mkdir"), true)
})

test("shQuote wraps single quotes", () => {
  assert.equal(shQuote("*.md"), "'*.md'")
  assert.equal(shQuote("it's"), `'it'\\''s'`)
})
