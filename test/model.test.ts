import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_DEEPSEEK_MODEL, resolveDeepseekModel } from "../src/lib/model.ts"

test("default model is V4.1 Flash", () => {
  assert.equal(DEFAULT_DEEPSEEK_MODEL, "deepseek-flash")
  assert.equal(resolveDeepseekModel({}), "deepseek-flash")
})

test("DEEPSEEK_MODEL overrides the default", () => {
  assert.equal(resolveDeepseekModel({ DEEPSEEK_MODEL: "deepseek-flash" }), "deepseek-flash")
})
