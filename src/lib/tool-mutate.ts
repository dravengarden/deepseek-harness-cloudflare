const WORKSPACE_WRITE = new Set(["bash", "write_file", "delete_file", "mkdir"])

/** True when workspace-write should ask, and when plan mode should refuse. */
export function toolMutates(name: string, args: Record<string, unknown> = {}): boolean {
  if (name === "str_replace_editor") return args.command !== "view"
  return WORKSPACE_WRITE.has(name)
}
