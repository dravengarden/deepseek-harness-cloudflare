# DeepSeek Harness on Cloudflare

A **Workers-native host** for DeepSeek Harness. The loop is a Cordis plugin
tree. The session log is the source of truth. Linux runs in Cloudflare
Sandbox. None of that is Node, and none of it is `npx @deepseek-ai/dsh`.

```text
Agent = Model + Harness
Harness = kernel + plugins
```

The kernel is official [`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis).
Every other seam — session, LLM, tools, skills, schedule, the agent loop —
is implemented here against `fetch`, Durable Object SQLite, and
[`@cloudflare/sandbox`](https://developers.cloudflare.com/sandbox/).

This is a teaching / demo-grade port of the **harness core**. It is not a
drop-in replacement for the official CLI, Web GUI, or plugin marketplace.

## How it is put together

```text
browser
  │  access-key cookie, or Cloudflare Access JWT
  ▼
Worker                 HTTP entry, auth, identityKey() → getByName
  │
  ├── Assets           desktop `/`  ·  phone/tablet `/m`
  ├── HarnessObject    Cordis tree + SQLite session log
  ├── ControlMailbox   ask_user_question waiters
  └── Sandbox          Linux container, /workspace, sleep after 10m
```

A Worker script is **required**. Access, Assets, Durable Objects, Containers,
and R2 cannot bind each other. The Worker is not the agent loop. The loop
lives on `HarnessObject`. Bash lives in the Sandbox.

The browser never picks a Durable Object id. After auth, the Worker calls
`getByName(identityKey())` for Harness, Mailbox, and Sandbox together.

Default identity is **shared-owner** (`IDENTITY_MODE` unset → `"owner"`).
Per-user objects (`user:<sub>`) exist in code; they turn on only when an
operator sets `IDENTITY_MODE=per-user`.

Full design: [`docs/architecture.md`](docs/architecture.md).

## Surfaces

Two independent SPAs share one `/api`. Official `dsh-web-frontend`, Typert,
and Node `dsh web` are not hosted.

| URL | Who | What |
|---|---|---|
| `/` | desktop | Workbench: rail, session sidebar, composer |
| `/m` | iPhone, iPad, Android phones | Chat shell. iPad (≥768px) keeps a persistent session column |
| `/?ui=desktop` | anyone | Pin the workbench (`dsh_ui` cookie) |

Phones and iPads hitting `/` redirect to `/m`. History replay uses settled
events only, so reopening a session does not duplicate streamed text.

## What this port includes

| Seam | Notes |
|---|---|
| Cordis 4.x | Official kernel. No YAML Loader, no HMR |
| Session log | Append-only SQLite, `deriveMessages()`, fork, delete |
| Model | DeepSeek V4.1 Flash (`deepseek-flash`), thinking, tools |
| Web | `web_search` (DeepSeek server-side search), `web_fetch` (SSRF-gated) |
| Linux | `bash`, files, glob/grep, `str_replace_editor` in `/workspace` |
| Workspace | `createBackup` on idle sleep, restore on next start |
| Skills | Catalog, `skill` tool, `/name`, bundled + `/workspace` SKILL.md |
| Subagent | In-process spawn / fork, max depth 3 |
| Todo, schedule, plan, ask-user | Schedule uses Durable Object alarms |
| Permissions | `workspace-write` (ask) / `danger-full-access` (never ask) |
| Commands | `/help` `/compact` `/plan` `/permission` `/workspace` `/checkpoint` |

What official DSH does that this runtime cannot take 1:1 is listed in
[`docs/core-gaps.md`](docs/core-gaps.md) (PTY, LSP, MCP stdio, Loader,
background jobs, vision, …). Third-party `dsh plugin add` packages do not
mount here. Write a Cordis module and add it in `src/compose.ts`.

## Requirements

- Node 22+ (Wrangler and tests only; the harness does not run on Node)
- [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) (Containers)
- Docker, for `wrangler dev` and for pushing the Sandbox image
- A DeepSeek API key

## Setup

```bash
git clone git@github.com:dravengarden/deepseek-harness-cloudflare.git
cd deepseek-harness-cloudflare
npm install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` (never commit it):

| Variable | Local | Production |
|---|---|---|
| `DEEPSEEK_API_KEY` | required | `wrangler secret put` |
| `DSH_CF_ACCESS_KEY` | required, long random string | same, until Access is on |
| `DEEPSEEK_MODEL` | optional, default `deepseek-flash` | optional |
| `LOCAL_DEV=1` | set | omit |
| `TEAM_DOMAIN` / `POLICY_AUD` | omit | set after you create Access |
| `IDENTITY_MODE` | omit (shared-owner) | omit until you flip to `per-user` |

### Local

Docker must be running. Rootless / NixOS often need:

```bash
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
npx wrangler dev
```

Open the printed URL, paste `DSH_CF_ACCESS_KEY`, start a session. The first
Linux call builds `Dockerfile` (`FROM docker.io/cloudflare/sandbox:0.12.9`)
and can take a few minutes. Research-only turns (`web_search` / `web_fetch`)
do not start the container.

```bash
npm run verify
```

### Production

```bash
npx wrangler r2 bucket create dsh-cf-workspace-backups
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DSH_CF_ACCESS_KEY
npx wrangler deploy
```

Backups use the `BACKUP_BUCKET` binding (`localBucket: true`). You do not
need R2 API tokens. `preview_urls` is off. `workers.dev` is on by default.

Until `TEAM_DOMAIN` and `POLICY_AUD` are set, `/api/login` accepts the
access-key cookie. After they are set, `/api/login` is disabled and the
Worker validates `Cf-Access-Jwt-Assertion` against the team JWKS. It never
trusts unsigned email headers.

## Identity

`identityKey()` is the Durable Object name:

| Mode | Access JWT | Access key |
|---|---|---|
| unset / `shared-owner` | `"owner"` | `"owner"` |
| `per-user` | `user:<sub>` | `"local"` |

Email is display-only. Production per-user uses Access `sub`. Optional
`LEGACY_OWNER_SUB` / `LEGACY_OWNER_EMAIL` keep one principal on the old
`"owner"` SQLite when you flip. Rollback: unset `IDENTITY_MODE` and
redeploy. `user:*` objects hibernate unused; they are not copied back.

`max_instances` is **5 concurrent running containers**, not user count.
Sleeping sandboxes do not take a slot.

## Operations

```bash
npx wrangler tail
```

Logs are one JSON line with `level`, `msg`, `identityKey`, `sessionId`,
`route`, `doClass`, `elapsedMs`, `err`. JWTs, access keys, and
`DEEPSEEK_API_KEY` are never logged. Tool results are truncated.

Useful `msg` values: `unauthorized`, `composeHarness after hibernation`,
turn start/end/cancel, ask timeout/cancelled, sandbox restore hit/miss,
backup success/fail, sandbox capacity, schedule alarm.

## Plugins

```ts
import type { Context } from "@deepseek-ai/cordis"

export const name = "acme"
export const inject = ["tools", "systemPrompt"]

export function apply(ctx: Context) {
  ctx.tools.register({
    name: "acme_lookup",
    description: "Look up an Acme record",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async execute(args) {
      return JSON.stringify({ id: args.id })
    },
  })
}
```

Mount from `composeHarness(env, sql, { identityKey, plugins: [acme] })`.
Seams: [`docs/plugins.md`](docs/plugins.md).

## Documentation

| Doc | Role |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System design: products, objects, turn, identity |
| [`docs/web.md`](docs/web.md) | SPA surfaces, auth, `/api` |
| [`docs/containers.md`](docs/containers.md) | Sandbox sleep, disk, backup/restore |
| [`docs/plugins.md`](docs/plugins.md) | How to write plugins |
| [`docs/core-gaps.md`](docs/core-gaps.md) | Official DSH that this runtime cannot take 1:1 |
| [`docs/design-cloudflare-native.md`](docs/design-cloudflare-native.md) | Original redesign plan (historical) |

## License

MIT. Cordis and the Sandbox SDK have their own licenses. This project is
not an official DeepSeek or Cloudflare product.
