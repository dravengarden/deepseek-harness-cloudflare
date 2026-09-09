# Core features that this host cannot take 1:1

Portable DeepSeek Harness core is implemented on this Worker: session log,
loop, llm, web, tools, skills (catalog + `skill` + `/name` + workspace
`SKILL.md`), subagent (in-process spawn/fork), todo, schedule tools, plan
mode, ask-user, auto-compact, linux sandbox.

These official core pieces **do not fit this runtime**. Please review whether
to drop, stub, or wait for a later host.

| Official package / tool | Why it does not port | Proposed stance |
|---|---|---|
| PTY / `terminal_*` / persistent bash | Needs a long-lived PTY in the container; Sandbox can exec, not a product PTY UI | Out of scope unless we add Sandbox `terminal()` later |
| Landlock / `sandbox-exec` / `ctx.sandbox` policy | No Linux Landlock in the Worker; CF Sandbox is the isolation boundary | Treat Sandbox as the sandbox; no extra Landlock |
| LSP (`dsh-tool-lsp`) | Language server is a long-lived subprocess + JSON-RPC | Out of scope for a briefing host |
| MCP stdio servers | No child processes in the isolate; stdio MCP cannot run here | HTTP MCP could be a later plugin |
| `dsh-tool-jobs` background bash/PTY/subagent | DO hibernation drops in-memory jobs; no worker threads | One-shot subagent only; no `job_list` / `run_in_background` |
| Continuable subagents (`send_message`, `interrupt_agent`) | Needs durable child activations across parent turns + jobs | Spawn/fork one-shot only (max depth 3) |
| ACP / Codex / Claude Code / dsh-sdk child backends | Separate Node CLIs | In-process child sessions only |
| Workflow engine + `ralph` + `run_code` PTC | Worker threads / JS orchestration VM | Out of scope |
| `cordis_*` dynamic plugins | `node:vm` loading untrusted packages | Out of scope (same as original host rule) |
| Official YAML Loader / HMR / `dsh plugin add` | Node CLI profile | TypeScript `composeHarness({ plugins })` only |
| PowerShell tools | Not in the Sandbox image contract we ship | bash only |
| `read_image` / vision | Needs attachments + an image-capable route | Out of scope until Flash vision is wired |
| File watchers (chokidar) for skills | No host FS watcher; workspace skills refresh when Linux has been used | Acceptable lag |
| Agent teams / goals (authority model) | Extra product surface, not the loop | Later if you want |
| `glob`/`grep` via vendored ripgrep | No `@vscode/ripgrep` binary in the Worker | Implemented via Sandbox `find`/`grep` |

If you want any row promoted from “out of scope” to a stub tool that returns a
clear error, say which ones.
