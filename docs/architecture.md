# Architecture

DeepSeek Harness on Cloudflare is a **Workers-native host** for the harness
model, not a container that runs `dsh` and not a Node compatibility shim.

```text
Agent = Model + Harness
Harness = kernel + plugins
```

Official `dsh` is a Node CLI whose Loader, HMR, PTY, and process-local
plugins assume a Node host. Those do not belong in the isolate. Bash and
`/workspace` belong in the Sandbox container.

The kernel does. `@deepseek-ai/cordis` core is ESM + `Proxy` / inject /
effects. Its only Node entry is `bin.js`. We import `Context` / `Service`
and never the Loader. Plugins below the kernel are ours, shaped like the
upstream seams so they can run in a Durable Object.

## Runtime

```text
browser
  │  Access JWT or access-key cookie
  ▼
Worker          entry + auth + binding fan-out
  │             identityKey() → getByName
  │             /answer → ControlMailbox
  │             /cancel and other /api → HarnessObject
  ▼
HarnessObject   Durable Object + SQLite
  │  compose() once per isolate lifetime
  ▼
@deepseek-ai/cordis 4.x  (official kernel; no Loader / HMR)
  ├─ settings / session / agents
  ├─ llm + llm-deepseek
  ├─ web + search/fetch providers
  ├─ tools + tool-web + tool-linux
  ├─ execution → Cloudflare Sandbox (bash / /workspace)
  ├─ systemPrompt sections + skills + time + briefing
  ├─ commands + compaction (/compact)
  ├─ schedule (Durable Object alarms)
  ├─ questions → ControlMailbox ask / answer / abort
  └─ agent-loop (deriveMessages, cancel)
```

The Durable Object is the unit of identity and storage. The in-memory plugin
tree is rebuilt after hibernation; the session log in SQLite is the source of
truth. That matches DeepSeek Harness: model-visible facts are logged events.

The Worker uses `fetch`, Web Crypto, Web Streams, and Durable Object SQL.
`nodejs_compat` is enabled only because the official Sandbox SDK wrangler
template requires it. Plugins still must not import `node:` APIs.

## Worker

A Worker script is **required**. Cloudflare Access, Workers Assets, Durable
Objects, Containers, and R2 cannot bind each other.

| Belief | Reality |
|---|---|
| Access sits in front, so the Worker is optional | Access injects `Cf-Access-Jwt-Assertion`. Something must verify it, call `getByName` / `getSandbox`, and hold the bindings. |
| The GUI is static, so the Worker is optional | Assets can serve `public/` without invoking the Worker. `/api/*`, login, and bindings still need the script. |
| The Durable Object holds state, so the Worker is redundant | DO classes are exported from the Worker module and bound in `wrangler.jsonc`. |

The Worker is entry + auth + binding fan-out. After `identityKey()`,
`POST /api/sessions/:id/answer` goes to ControlMailbox; `POST
/api/sessions/:id/cancel` and the rest of `/api` go to HarnessObject
(`getByName(key)`). It is not the agent loop, not session SQLite, and not
Linux. Those stay on `HarnessObject` and the Sandbox container. Official
`dsh-web-frontend`, Typert, and Node `dsh web` are rejected; the GUI is the
Workers Assets SPA.

## Ask-user mailbox

`ask_user_question` and permission Allow/Deny wait on a **ControlMailbox**
Durable Object, not on HarnessObject. Waiters are in-memory Promises keyed by
session id and question id. RPC arguments are strings and numbers only.

| Method | Role |
|---|---|
| `ask(sessionId, id, timeoutMs)` | Park until answer, abort, or timeout |
| `answer(sessionId, id, text)` | Resolve the waiter; `false` if none |
| `abort(sessionId, id)` | Reject with `ask_user_question cancelled`; `false` if none |

The mailbox is named with the same `identityKey` as HarnessObject (default
`"owner"`). AbortSignal stays in the harness isolate: `QuestionService`
listens to the turn signal and calls `abort(sessionId, id)`. Do not pass
AbortSignal over Durable Object RPC.

`POST /api/sessions/:id/cancel` stays on HarnessObject (`agentLoop.cancel`).
The `QUESTIONS` / `QuestionGate` binding is kept until a later tombstone.

## What we keep from DeepSeek Harness

| Seam | DSH package | This host |
|---|---|---|
| Kernel | `@deepseek-ai/cordis` | Official package. Loader/include unused. |
| Session | `dsh-session` | Append-only log, `deriveMessages()`, `fork()` |
| Agents | `dsh-agent` | `ctx.agents`, Agent handle |
| LLM | `dsh-llm` + `dsh-llm-deepseek` | Adapter seam + Flash |
| Web | `dsh-web` family | Provider registry + official search/fetch |
| Tools | `dsh-tools` + `dsh-tool-web` | Register/unwind + execute events |
| Prompt | `dsh-system-prompt` | Ordered sections plugins can add |
| Commands | `dsh` command registry | `/compact` and extras |
| Settings | `dsh-settings` | SQLite documents |
| Schedule | `dsh-schedule` | DO `setAlarm` instead of Node timers |
| Skills | `dsh-skill` | Catalog + prompt section |
| Compaction | `dsh-compaction` | Summary event + `/compact` |
| Loop | `dsh-agent-loop` | Turn/step from derived history |
| Linux | E2B / local bash | Official `@cloudflare/sandbox` |
| Skills | `dsh-skill` + filesystem + `skill` tool | Catalog, loader, `/name`, `/workspace` SKILL.md |
| Subagent | `dsh-subagent` spawn/fork | In-process child session, max depth 3 |
| Todo | `todo_write` | Session log `todo/write` |
| Schedule tools | `schedule_*` | DO alarms |
| Plan | `dsh-plan-mode` | `/plan` + `exit_plan_mode` |
| Ask user | `ask_user_question` | ControlMailbox `ask` / `answer` / `abort` |

## What we do not port

- `dsh` CLI, profiles, YAML Loader, HMR
- PTY, Landlock, LSP, code-runtime, MCP stdio, workflow/ralph, dynamic cordis
- official Web UI plugin roster
- `node:vm` dynamic plugins
- continuable/background jobs (see [`core-gaps.md`](core-gaps.md))

Linux bash and `/workspace` run in Cloudflare Sandbox, the same role E2B
plays upstream — not the host of the loop. See
[`containers.md`](containers.md).

## Turn flow

```text
turn/start
  append user/message
  assemble system prompt + tool schemas
  loop:
    llm/stream → assistant/chunk*
    tool/call* → tools/execute → tool/result*
    if no tool calls: break
  assistant/message
turn/end
```

`web_search` is a model-facing tool. Its provider calls DeepSeek's
Anthropic-compatible Messages API with `web_search_20250305` (server-side
search, same key as the chat model). `web_fetch` is ordinary `fetch` with
SSRF checks. The agent loop never sees Node.

## Auth

Production authenticates with **Cloudflare Access**. The Worker validates
`Cf-Access-Jwt-Assertion` against the team JWKS (`TEAM_DOMAIN` +
`POLICY_AUD`). Local `wrangler dev` falls back to `DSH_CF_ACCESS_KEY`.

The browser never chooses the Durable Object id. The Worker calls
`getByName(identityKey())`. Access is the identity gate. Production is not
per-user until an operator sets `IDENTITY_MODE=per-user`.

The architecture *target* is one HarnessObject and one Sandbox per Access
identity (`identityKey()` in `src/identity.ts`: `user:<sub>` when
`IDENTITY_MODE=per-user`; local access-key → `"local"`). The *ship default*
is `IDENTITY_MODE` unset = `shared-owner` so existing owner SQLite is not
orphaned. Email is display-only; production per-user uses Access `sub`.
`max_instances` is 5 concurrent *running* containers, not user count;
sleeping sandboxes do not count. See [`web.md`](web.md).

## Persistence

```sql
sessions(id, title, created_at)
events(session_id, seq, type, payload, created_at)
```

Hibernation drops the kernel. The next request composes plugins again and
reads history from `events`. `/workspace` is snapshotted on Sandbox
`onActivityExpired` (official idle stop) into the Sandbox Durable Object
store, then restored after the next sleep.
