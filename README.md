# DeepSeek Harness on Cloudflare

A **Workers-native host** for the DeepSeek Harness model: everything is a
plugin, the session log is the source of truth, and Linux runs in an official
Cloudflare Sandbox — not in Node, and not inside `npx @deepseek-ai/dsh`.

```text
Agent = Model + Harness
Harness = kernel + plugins
```

The kernel is official [`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis).
Every other seam is implemented here against `fetch`, Durable Object SQLite,
and `@cloudflare/sandbox`.

This is a teaching / demo-grade port of the **harness core** onto Cloudflare.
It is not a drop-in replacement for the official CLI, Web GUI, or plugin
marketplace.

## Architecture

```text
browser
  │  Cloudflare Access (production) or access-key cookie (wrangler dev)
  ▼
Worker                 auth, static UI, /api/* → one Durable Object
  │
  ▼
HarnessObject          Durable Object + SQLite
  │  composeHarness() once per isolate lifetime
  ▼
@deepseek-ai/cordis 4.x
  ├─ settings / session / agents
  ├─ llm + llm-deepseek          api.deepseek.com  (V4 Flash)
  ├─ web + search / fetch        native search + public HTTP (SSRF-gated)
  ├─ tools + linux / web / skill / todo / schedule / subagent / ask-user
  ├─ execution → Sandbox DO      bash, /workspace, createBackup on idle
  ├─ systemPrompt, skills, plan, permissions, compaction
  ├─ schedule                    Durable Object alarms
  └─ agent-loop                  deriveMessages → stream → tools → turn/end

QuestionGate           separate DO so ask-user / approvals are not queued
                       behind the paused turn
Sandbox                official @cloudflare/sandbox container
                       sleepAfter 10m, backup /workspace to R2 on idle
```

Identity is always `idFromName("owner")`. The browser never picks a Durable
Object id. Cloudflare Access decides *who may use* the app; it does not
create one sandbox per user.

Hibernation drops the in-memory plugin tree. The next request composes again
and rebuilds model history from the append-only `events` table. Container
disk is ephemeral; `/workspace` is restored from the last Sandbox
`DirectoryBackup` handle after sleep.

More detail: [`docs/architecture.md`](docs/architecture.md),
[`docs/containers.md`](docs/containers.md), [`docs/web.md`](docs/web.md),
[`docs/plugins.md`](docs/plugins.md).

## What is in this port

| Seam | Status |
|---|---|
| Official Cordis kernel (no Loader / HMR) | Yes |
| Session log, `deriveMessages()`, fork | Yes |
| DeepSeek V4 Flash + thinking + tools | Yes |
| `web_search` / `web_fetch` | Yes |
| Skills: catalog, `skill` tool, `/name`, bundled + `/workspace` SKILL.md | Yes |
| Subagent: in-process spawn / fork, max depth 3 | Yes |
| Todo, schedule tools, plan mode, ask-user | Yes |
| Auto-compact on long history | Yes |
| Linux via official Sandbox (`bash`, files, glob/grep/str_replace) | Yes |
| `/workspace` persistence via `createBackup` on `onActivityExpired` | Yes |
| Permissions: `workspace-write` (ask) / `danger-full-access` (never ask) | Yes |
| Web UI: official workbench layout (rail, sessions, chat) on `/api` | Yes (not the Typert React client) |
| Plugin host: `composeHarness(env, sql, { plugins })` | Yes |

## What is not migrated

Official `dsh web`, the YAML Loader, and several core packages assume a Node
process. They are **not** in this repository. Full table:
[`docs/core-gaps.md`](docs/core-gaps.md).

| Official piece | Why it is absent |
|---|---|
| `@deepseek-ai/dsh-web-app` | Node GUI, process-token cookie, Typert RPC. This repo ships a Workers SPA over `/api` instead |
| `dsh` CLI, profiles, `dsh plugin add`, HMR | No Node host, no YAML Loader |
| PTY / `terminal_*` / persistent bash | Sandbox can `exec`, not a product PTY |
| Landlock / `ctx.sandbox` policy | Isolation is the Cloudflare container |
| LSP | Long-lived language server |
| MCP stdio | No child processes in the isolate (HTTP MCP could come later) |
| Background jobs / continuable subagents | DO hibernation drops in-memory jobs |
| ACP / Codex / Claude Code / dsh-sdk children | Separate Node CLIs |
| Workflow / ralph / `run_code` PTC | Worker threads / `node:vm` |
| Dynamic `cordis_*` plugins | Untrusted package load |
| PowerShell, vision / `read_image`, agent teams, goals | Not on this runtime |
| Multi-user harness (one DO + sandbox per identity) | Access is a gate in front of a single owner |

Do not expect `npx @deepseek-ai/dsh web` plugins to `dsh plugin add` onto this
Worker. Third-party plugins must be Cordis modules mounted from
`src/compose.ts`.

## Requirements

- Node 22+ (for Wrangler and tests only; the harness does not run on Node)
- A [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/)
  account (Containers / Sandbox)
- Docker, for `wrangler dev` and for deploying the Sandbox image
- A DeepSeek API key
- For production backups: an R2 bucket and an R2 API token
- For production identity: Cloudflare Zero Trust / Access

## Setup

### 1. Clone and install

```bash
git clone git@github.com:dravengarden/deepseek-harness-cloudflare.git
cd deepseek-harness-cloudflare
npm install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` (never commit this file):

| Variable | Local | Production |
|---|---|---|
| `DEEPSEEK_API_KEY` | required | `wrangler secret put` |
| `DSH_CF_ACCESS_KEY` | required (long random string) | unused if Access is on |
| `DEEPSEEK_MODEL` | optional, default `deepseek-v4-flash` | optional |
| `LOCAL_DEV=1` | required so backups use the R2 binding | omit |
| `TEAM_DOMAIN` | omit | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | omit | Access application AUD |
| `CLOUDFLARE_ACCOUNT_ID` | omit | required for production backups |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | omit | R2 API token with object read/write |

### 2. Local development

Start Docker, then:

```bash
npx wrangler dev
# or: just dev
```

Open the printed URL, enter the access key, start a session. The first
Sandbox start builds `Dockerfile` (`FROM docker.io/cloudflare/sandbox:0.12.9`)
and can take a few minutes.

```bash
npm run verify
```

Linux tools need the container. Research-only turns (`web_search` /
`web_fetch`) do not start it.

### 3. Production deploy

Create the backup bucket once:

```bash
npx wrangler r2 bucket create dsh-cf-workspace-backups
```

Put secrets (do not put them in `wrangler.jsonc`):

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Set Access vars after you create the Access application:

```bash
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put POLICY_AUD
```

Deploy (Docker must be running so Wrangler can push the container image):

```bash
npx wrangler deploy
```

### 4. Cloudflare Access

1. In the Worker dashboard, enable **Cloudflare Access** (one-click Access
   for Workers), or create a Zero Trust self-hosted application for the
   hostname.
2. Allow your identity provider (email, GitHub, OTP, …).
3. Copy the application's **AUD** tag and team domain into `POLICY_AUD` and
   `TEAM_DOMAIN`.
4. The Worker validates `Cf-Access-Jwt-Assertion` against the team JWKS. It
   does not trust unsigned email headers.

Sign-out redirects to `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout`.

Until `TEAM_DOMAIN` and `POLICY_AUD` are set, the app uses the local access
key. After they are set, `/api/login` is disabled.

### 5. Permissions in the UI

- **workspace-write** — Linux tools stay under `/workspace` and ask Allow /
  Deny before mutating.
- **danger-full-access** — still confined to the Sandbox `/workspace` (there
  is no host disk to unlock); mutating tools do not ask.

## Configuration notes

- `nodejs_compat` is on because the official Sandbox wrangler template
  requires it. Plugins must still not import `node:` APIs.
- Sandbox `instance_type` is `basic` (1 GiB), not hello-world `lite`.
- `sleepAfter` is `10m`. `keepAlive` is off. Billing stops when the
  container sleeps.
- `/workspace` backups run on the official `onActivityExpired` hook (one
  snapshot per sleep), not on every model turn. `/checkpoint` forces one.
- Default backup TTL is 7 days. Production restore is a FUSE overlay that
  vanishes on the next sleep and is restored again from the stored handle.

## Develop a plugin

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

Mount it from `composeHarness(env, sql, { plugins: [acme] })`. See
[`docs/plugins.md`](docs/plugins.md).

## License

MIT. Cordis and the Sandbox SDK are their own licenses. This project is not
an official DeepSeek or Cloudflare product.
