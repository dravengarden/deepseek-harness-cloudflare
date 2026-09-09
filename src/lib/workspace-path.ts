export const WORKSPACE_ROOT = "/workspace"
export const WORKSPACE_MARKER = "/workspace/.dsh-cf"

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspacePathError"
  }
}

/** Resolve a user path to an absolute path under `/workspace`. */
export function resolveWorkspacePath(input: string | undefined, fallback = WORKSPACE_ROOT): string {
  const trimmed = (input ?? "").trim() || fallback
  const absolute = trimmed.startsWith("/") ? trimmed : `${WORKSPACE_ROOT}/${trimmed}`
  const parts: string[] = []
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  const resolved = `/${parts.join("/")}`
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}/`)) {
    throw new WorkspacePathError("path must be under /workspace")
  }
  return resolved
}

export function workspaceParent(path: string): string | undefined {
  const resolved = resolveWorkspacePath(path)
  if (resolved === WORKSPACE_ROOT) return undefined
  return resolved.slice(0, resolved.lastIndexOf("/")) || WORKSPACE_ROOT
}
