import assert from "node:assert/strict"
import test from "node:test"
import { firstRow, type SqlCursor } from "../src/sql.ts"

function cursor(rows: Record<string, unknown>[]): SqlCursor {
  return {
    one() {
      throw new Error("one() must not be used for optional lookups")
    },
    *[Symbol.iterator]() {
      yield* rows
    },
  }
}

test("firstRow returns null for an empty cursor", () => {
  assert.equal(firstRow(cursor([])), null)
})

test("firstRow returns the first row", () => {
  assert.deepEqual(firstRow(cursor([{ document: "{}" }, { document: "x" }])), { document: "{}" })
})
