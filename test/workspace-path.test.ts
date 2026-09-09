import assert from "node:assert/strict"
import test from "node:test"
import { WorkspacePathError, resolveWorkspacePath, workspaceParent } from "../src/lib/workspace-path.ts"

test("resolves relative and absolute paths under /workspace", () => {
  assert.equal(resolveWorkspacePath("notes.md"), "/workspace/notes.md")
  assert.equal(resolveWorkspacePath("/workspace/a/b"), "/workspace/a/b")
  assert.equal(resolveWorkspacePath(""), "/workspace")
  assert.equal(resolveWorkspacePath("/workspace/foo/../bar"), "/workspace/bar")
})

test("rejects paths that escape /workspace", () => {
  assert.throws(() => resolveWorkspacePath("/tmp/x"), WorkspacePathError)
  assert.throws(() => resolveWorkspacePath("/workspace/../etc/passwd"), WorkspacePathError)
})

test("workspaceParent stays inside /workspace", () => {
  assert.equal(workspaceParent("/workspace/a/b.txt"), "/workspace/a")
  assert.equal(workspaceParent("file.txt"), "/workspace")
  assert.equal(workspaceParent("/workspace"), undefined)
})
