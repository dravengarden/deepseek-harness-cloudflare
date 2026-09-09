import type { Context } from "@deepseek-ai/cordis"

export const name = "tool-linux"
export const inject = ["tools", "execution", "systemPrompt", "commands"]

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "linux",
    order: 30,
    text: () => `Linux tools run in a Cloudflare Sandbox container. The workspace is /workspace.

The container sleeps after 10 minutes idle (official sleepAfter). Disk is ephemeral; this host restores /workspace from the last Sandbox createBackup() handle on the next start.

Use bash / files when a command, script, or local file helps. Do not use the shell as a substitute for web_search.`,
  })

  ctx.tools.register({
    name: "bash",
    description: "Run a shell command in /workspace of the Linux sandbox.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command" },
        cwd: { type: "string", description: "Working directory under /workspace" },
      },
      required: ["command"],
    },
    async execute(args, signal) {
      const command = String(args.command ?? "").trim()
      if (!command) return JSON.stringify({ error: "command is required" })
      const cwd = args.cwd === undefined ? undefined : String(args.cwd)
      return JSON.stringify(await ctx.execution.bash(command, cwd, signal))
    },
  })

  ctx.tools.register({
    name: "read_file",
    description: "Read a utf-8 file under /workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path under /workspace" },
      },
      required: ["path"],
    },
    async execute(args) {
      const path = String(args.path ?? "").trim()
      if (!path) return JSON.stringify({ error: "path is required" })
      return JSON.stringify(await ctx.execution.readFile(path))
    },
  })

  ctx.tools.register({
    name: "write_file",
    description: "Write a utf-8 file under /workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path under /workspace" },
        content: { type: "string", description: "File contents" },
      },
      required: ["path", "content"],
    },
    async execute(args) {
      const path = String(args.path ?? "").trim()
      if (!path) return JSON.stringify({ error: "path is required" })
      return JSON.stringify(await ctx.execution.writeFile(path, String(args.content ?? "")))
    },
  })

  ctx.tools.register({
    name: "list_dir",
    description: "List files under /workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory under /workspace (default /workspace)" },
        recursive: { type: "boolean", description: "List nested files" },
      },
    },
    async execute(args) {
      const path = args.path === undefined ? undefined : String(args.path)
      return JSON.stringify(await ctx.execution.listDir(path, Boolean(args.recursive)))
    },
  })

  ctx.tools.register({
    name: "mkdir",
    description: "Create a directory under /workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory under /workspace" },
      },
      required: ["path"],
    },
    async execute(args) {
      const path = String(args.path ?? "").trim()
      if (!path) return JSON.stringify({ error: "path is required" })
      return JSON.stringify(await ctx.execution.mkdir(path))
    },
  })

  ctx.tools.register({
    name: "delete_file",
    description: "Delete a file under /workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File under /workspace" },
      },
      required: ["path"],
    },
    async execute(args) {
      const path = String(args.path ?? "").trim()
      if (!path) return JSON.stringify({ error: "path is required" })
      return JSON.stringify(await ctx.execution.deleteFile(path))
    },
  })

  ctx.tools.register({
    name: "glob",
    description: "Find files under /workspace matching a glob (find + name).",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob, e.g. **/*.md" },
        path: { type: "string", description: "Directory under /workspace" },
      },
      required: ["pattern"],
    },
    async execute(args, signal) {
      const pattern = String(args.pattern ?? "").trim()
      if (!pattern) return JSON.stringify({ error: "pattern is required" })
      const cwd = args.path === undefined ? undefined : String(args.path)
      return JSON.stringify(await ctx.execution.bash(`find . -path './${pattern.replace(/'/g, "")}' -print 2>/dev/null | head -n 200`, cwd, signal))
    },
  })

  ctx.tools.register({
    name: "grep",
    description: "Search file contents under /workspace.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
      },
      required: ["pattern"],
    },
    async execute(args, signal) {
      const pattern = String(args.pattern ?? "").replace(/'/g, "")
      if (!pattern) return JSON.stringify({ error: "pattern is required" })
      const path = args.path === undefined ? "." : String(args.path)
      return JSON.stringify(await ctx.execution.bash(`grep -R -n -I -E '${pattern}' -- ${path} 2>/dev/null | head -n 200`, undefined, signal))
    },
  })

  ctx.tools.register({
    name: "str_replace_editor",
    description: "View or uniquely replace a string in a /workspace file.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["view", "str_replace"] },
        path: { type: "string" },
        old_str: { type: "string" },
        new_str: { type: "string" },
      },
      required: ["command", "path"],
    },
    async execute(args) {
      const path = String(args.path ?? "").trim()
      if (!path) return JSON.stringify({ error: "path is required" })
      if (args.command === "view") return JSON.stringify(await ctx.execution.readFile(path))
      const oldStr = String(args.old_str ?? "")
      const file = await ctx.execution.readFile(path)
      const count = file.content.split(oldStr).length - 1
      if (count !== 1) return JSON.stringify({ error: `old_str must match exactly once (matched ${count})` })
      return JSON.stringify(await ctx.execution.writeFile(path, file.content.replace(oldStr, String(args.new_str ?? ""))))
    },
  })

  ctx.commands.register({
    name: "workspace",
    description: "List /workspace in the Linux sandbox",
    async run() {
      const listing = await ctx.execution.listDir(undefined, true)
      if (listing.files.length === 0) return "/workspace is empty"
      return listing.files.map((file) => `${file.type.padEnd(9)} ${file.path}`).join("\n")
    },
  })

  ctx.commands.register({
    name: "checkpoint",
    description: "Snapshot /workspace to R2 now (also happens automatically on idle sleep)",
    async run() {
      const backup = await ctx.execution.checkpoint()
      return `backed up ${backup.dir} as ${backup.id}`
    },
  })
}
