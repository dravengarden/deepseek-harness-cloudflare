import assert from "node:assert/strict"
import test from "node:test"
import { isSandboxCapacityError, SANDBOX_CAPACITY_MESSAGE } from "../src/lib/sandbox-capacity.ts"

test("sandbox capacity message is stable", () => {
  assert.equal(
    SANDBOX_CAPACITY_MESSAGE,
    "sandbox capacity reached (max_instances); retry when another workspace sleeps",
  )
})

test("isSandboxCapacityError matches provision and max_instances", () => {
  assert.equal(isSandboxCapacityError(new Error("max_instances exceeded")), true)
  assert.equal(isSandboxCapacityError(new Error("Exceeded the maximum number of instances")), true)
  assert.equal(isSandboxCapacityError(new Error("no available instance")), true)
  assert.equal(isSandboxCapacityError(new Error("container provision failed")), true)
  assert.equal(isSandboxCapacityError(new Error("capacity reached")), true)
  const wrapped = new Error("start failed")
  wrapped.cause = new Error("max instances")
  assert.equal(isSandboxCapacityError(wrapped), true)
})

test("isSandboxCapacityError ignores unrelated errors", () => {
  assert.equal(isSandboxCapacityError(new Error("file not found")), false)
  assert.equal(isSandboxCapacityError(undefined), false)
})
