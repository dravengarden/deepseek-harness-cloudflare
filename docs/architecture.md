# Architecture

DeepSeek Harness on Cloudflare is a **Workers-native host** for the harness
model. It is not a container that runs `dsh`, and it is not a Node
compatibility shim.

```text
Agent = Model + Harness
Harness = kernel + plugins
```

Official `dsh` is a Node CLI. Its Loader, HMR, PTY, and process-local
plugins assume a Node host. Those do not belong in a Worker isolate. Bash
and `/workspace` belong in a container. The Cordis kernel belongs in an
isolate that can hibernate and come back from a log.

That split is the whole design.

## Cloudflare products

Each product does one job. Nothing is a substitute for the Worker script.

| Product | Role here |
|---|---|
| Worker | HTTP entry, auth, `identityKey()`, binding fan-out |
| Workers Assets | Two SPAs (`/` and `/m`), `run_worker_first` so `/` can 302 |
| Durable Object `HarnessObject` | Cordis tree, SQLite session log, agent loop |
| Durable Object `ControlMailbox` | In-memory ask/answer waiters |
| Durable Object `Sandbox` | Official `@cloudflare/sandbox` container |
| R2 `BACKUP_BUCKET` | `/workspace` snapshots on idle sleep |
| Cloudflare Access (optional) | Who may use the hostname; JWT still verified in the Worker |

Access, Assets, Durable Objects, Containers, and R2 cannot bind each other
without a Worker. Access is an identity reverse proxy, not an application
runtime. Assets can serve `public/` without invoking the Worker;
`run_worker_first` is **true** so the script can redirect phones and iPads
before `index.html` is served.

## Runtime

```text
browser
  │  access-key cookie  or  Cf-Access-Jwt-Assertion
  ▼
Worker
  │  identityKey() → getByName(key) for all three objects
  │
  ├─ GET  / /m /assets     Assets (Worker may 302 `/` → `/m`)
  ├─ POST /api/login       access-key cookie (disabled if Access is configured)
  ├─ POST /api/sessions/:id/answer   ControlMailbox.answer
  └─ other /api/*          HarnessObject.fetch
         │
         ▼
    HarnessObject (SQLite)
         composeHarness() once per isolate lifetime
         │
         ▼
    @deepseek-ai/cordis 4.x
         settings · sessions · agents
         llm + llm-deepseek          api.deepseek.com  (deepseek-flash)
         web + search / fetch
         tools + linux / web / skill / todo / schedule / subagent / ask-user
         execution ──► Sandbox (bash, /workspace, backup on sleep)
         systemPrompt · skills · plan · permissions · compaction
         schedule (setAlarm) · questions (mailbox RPC)
         agent-loop (deriveMessages → stream → tools → turn/end)
```

The Durable Object is the unit of identity and storage. Hibernation drops
the in-memory plugin tree. The next request composes again and rebuilds
model history from the append-only `events` table. That matches upstream
DeepSeek Harness: **model-visible facts are logged events**.

The Worker uses `fetch`, Web Crypto, Web Streams, and Durable Object SQL.
`nodejs_compat` is on because the official Sandbox wrangler template
requires it. Plugins still must not import `node:` APIs.

## Identity

The browser never chooses a Durable Object id.

```text
resolveIdentity(request)
    Access JWT  →  { email, sub, source: "access" }
    or cookie   →  { email: "owner", source: "key" }
        │
        ▼
identityKey(identity, env)
        │
        ▼
getByName(key)  ×  Harness + Mailbox + Sandbox
```

| `IDENTITY_MODE` | Access JWT | Access-key cookie |
|---|---|---|
| unset or `shared-owner` | `"owner"` | `"owner"` |
| `per-user` | `user:<sub>` | `"local"` |

Unset is **not** per-user. Email is display-only; production per-user uses
Access `sub` and fail-closes if `sub` is missing. `LEGACY_OWNER_SUB` /
`LEGACY_OWNER_EMAIL` can pin one Access principal to the old `"owner"`
SQLite in the same deploy as the flip.

`max_instances` is 5 concurrent **running** containers, not registered
users. Sleeping sandboxes do not take a slot. A sixth concurrent Linux
start fails tools with a stable capacity string.

## Session log

```sql
sessions(id, title, created_at, parent_id)
events(session_id, seq, type, payload, created_at)
```

`session.deriveMessages()` is the only history the model sees. Do not build
an ad-hoc message array that drops tool calls. Compaction inserts a
`compaction/summary` event; later derives skip events through that seq.

Fork copies events up to a turn boundary and refuses to fork during an
open turn. Delete removes the session row and its events. List is capped
at 200.

## Turn

```text
turn/start
  user/message
  inject named /skills if the prompt starts with /name
  loop (max 24 steps):
    assemble system prompt + tool schemas
    llm/stream → assistant/thinking*  assistant/chunk*  tool/call*
    if no tool calls: break
    tools/execute → permission gate → tool/result
  assistant/message
turn/end
```

Cancel is `POST /api/sessions/:id/cancel` → `agentLoop.cancel` in the
Harness isolate. `AbortSignal` is not RPC-serializable; it is never passed
to Sandbox or Mailbox. Linux `exec` uses a 120s timeout instead.

`web_search` calls DeepSeek's Anthropic-compatible Messages API with
`web_search_20250305` (same API key as chat). `web_fetch` is ordinary
`fetch` with SSRF checks. The loop never sees Node.

## Ask-user mailbox

`ask_user_question` and permission Allow/Deny wait on **ControlMailbox**,
not on HarnessObject. Waiters are in-memory Promises. RPC arguments are
strings and numbers only.

| RPC | Role |
|---|---|
| `ask(sessionId, id, timeoutMs)` | Park until answer, abort, or timeout |
| `answer(sessionId, id, text)` | Resolve; `false` if none |
| `abort(sessionId, id)` | Reject `ask_user_question cancelled` |

The mailbox is named with the same `identityKey` as HarnessObject. The
turn's `AbortSignal` stays in the harness isolate and calls `abort(...)`.
Turns that are waiting on ask-user are **not** resumed across hibernation
(deferred).

## Linux

Sandbox is the isolation boundary (the E2B role upstream). There is no
Landlock policy in the Worker.

- Image: `docker.io/cloudflare/sandbox:0.12.9`, `instance_type: basic`
- Id: `getSandbox(env.Sandbox, identityKey, { sleepAfter: "10m" })`
- Disk is ephemeral. `onActivityExpired` snapshots `/workspace` with
  `createBackup({ localBucket: true })`, stores the handle on the Sandbox
  DO, then `stop()`. Next start restores only if `/workspace/.dsh-cf` is
  missing.
- Mutating tools under `workspace-write` ask Allow/Deny. `glob`, `grep`,
  and `str_replace_editor` `view` do not. Plan mode refuses mutating tools.

See [`containers.md`](containers.md).

## Web surfaces

Official `dsh-web-frontend` needs Node `__ModuleLoader__` and Typert RPC.
This host does not have that plane. The GUI is two Assets SPAs over `/api`.

| Surface | Files | Layout |
|---|---|---|
| Desktop `/` | `index.html` `styles.css` `app.js` | 56px rail, sidebar, composer |
| Chat `/m` | `m.html` `mobile.css` `mobile.js` | Phone: single column + drawer. Tablet (≥768px): session column + thread |

Routing: iPhone / iPad / Android phone UAs, or a client-side iPadOS check
(`Macintosh` + `maxTouchPoints > 1`), send `/` to `/m`. `/?ui=desktop`
pins `dsh_ui=desktop`. Both SPAs share the auth cookie.

HTTP API (HarnessObject unless noted):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/login` | Worker; access-key cookie |
| POST | `/api/logout` | Worker |
| GET | `/api/me` | Worker; `{ model, email, auth, identityKey, identityMode }` |
| GET/POST | `/api/sessions` | List / create |
| GET/DELETE | `/api/sessions/:id` | Replay events / delete |
| POST | `/api/sessions/:id/turn` | SSE `text/event-stream` |
| POST | `/api/sessions/:id/cancel` | Abort in-flight turn |
| POST | `/api/sessions/:id/fork` | |
| POST | `/api/sessions/:id/command` | `/compact` and others |
| POST | `/api/sessions/:id/answer` | Worker → Mailbox |
| GET/PUT | `/api/settings` | Permission preset |
| GET | `/api/commands` | Slash menu |

See [`web.md`](web.md).

## Plugin host

`composeHarness(env, sql, { identityKey, plugins })` mounts the tree in
`src/compose.ts`. Third-party plugins are Cordis modules of the same
shapes official DSH uses (`apply`, `inject`, `ctx.tools.register`, …).
They must not import `node:`. There is no YAML Loader and no
`dsh plugin add`.

Seams: [`plugins.md`](plugins.md). Non-goals: [`core-gaps.md`](core-gaps.md).

## Security

- Secrets stay in Wrangler secrets / `.dev.vars`. Never in Assets.
- Access JWT is verified against team JWKS (`TEAM_DOMAIN`, `POLICY_AUD`).
  Unsigned `Cf-Access-Authenticated-User-Email` is ignored.
- Access-key cookie is HttpOnly, SameSite=Lax, Secure on HTTPS.
- `web_fetch` rejects credentials, localhost, and IP literals.
- Linux cannot see the host filesystem; it is confined to Sandbox
  `/workspace`.
- `preview_urls` is false. Responses set CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`.

Cloudflare Access in front of the hostname is the production identity
gate. Until `TEAM_DOMAIN` / `POLICY_AUD` are set, the access-key cookie
is the gate. Anyone who can reach the Worker URL and the key can use the
shared-owner object.

## What we refuse

These are not “not yet.” They assume a Node process or a long-lived child:

- Official `dsh web` / Typert / `dsh-web-frontend`
- YAML Loader, HMR, `dsh plugin add`
- PTY / persistent bash, Landlock, LSP, MCP stdio
- Background jobs, continuable subagents, ACP / Codex / Claude children
- Workflow / ralph / `node:vm` dynamic plugins
- Vision / `read_image` until an image route exists

The original product-split plan that produced this shape is
[`design-cloudflare-native.md`](design-cloudflare-native.md) (historical).
