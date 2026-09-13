# Web surface

Official `dsh web` is a Node GUI: process-token cookie, Typert RPC,
loopback Host fence, `window.__ModuleLoader__`. That binary does not run
on Workers. This host serves two Workers Assets SPAs over the harness
`/api`.

It is not `chat.deepseek.com` and not `dsh-web-frontend`.

## Surfaces

| | Desktop `/` | Chat `/m` |
|---|---|---|
| Files | `public/index.html` `styles.css` `app.js` | `public/m.html` `mobile.css` `mobile.js` |
| Layout | 56px rail, session sidebar, composer | Phone: column + drawer. iPad ≥768px: session column + thread |
| Who | Pointer desktop | iPhone, iPad, Android phone |

`run_worker_first` is true so the Worker can 302 `/` → `/m` before Assets
serves `index.html`. iPadOS 13+ often sends a Macintosh User-Agent; the
desktop HTML also checks `navigator.maxTouchPoints > 1` and replaces to
`/m`. `/?ui=desktop` and the “Desktop site” link pin `dsh_ui=desktop`.

Both SPAs share the auth cookie and `/api`. History replay uses settled
events (`assistant/message`, tools), not live `assistant/chunk` rows.

Shared chrome: sessions, fork, compact, stop, slash commands from
`GET /api/commands`, permission preset, ask-user cards. Email /
`identityKey` are display-only. The SPA does not send `identityKey` back
and does not offer a tenant picker.

## Authentication

Two modes. They are mutually exclusive.

### Access key (default)

If `TEAM_DOMAIN` and `POLICY_AUD` are unset, `POST /api/login` accepts
`DSH_CF_ACCESS_KEY` and sets `dsh_cf` (HttpOnly, SameSite=Lax, Secure on
HTTPS). This is what `wrangler dev` uses, and what a public `workers.dev`
deploy uses until Access is configured.

### Cloudflare Access (production identity)

1. Deploy the Worker.
2. Enable Cloudflare Access on the Worker, or create a Zero Trust
   self-hosted application for the hostname.
3. Secret `TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com`
4. Secret `POLICY_AUD` = the application's AUD tag
5. Allow policy (email, GitHub, OTP, …)

The Worker verifies `Cf-Access-Jwt-Assertion` against the team JWKS. It
does not trust unsigned email headers. `/api/login` returns 400. Sign-out
goes to `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout`.

Access decides **who may use** the app. Tenant routing is still
`identityKey()` — shared-owner until `IDENTITY_MODE=per-user`.

### `GET /api/me`

Worker-only JSON, after JWT or cookie verification:

| Field | Meaning |
|---|---|
| `model` | `DEEPSEEK_MODEL` or `deepseek-flash` |
| `email` | Display only. Never a tenant id |
| `auth` | `"access"` or `"key"` |
| `identityKey` | `"owner"`, `"local"`, or `user:<sub>` |
| `identityMode` | `"per-user"` only when `IDENTITY_MODE=per-user`; else `"shared-owner"` |
| `sub` | Access subject, when present |

Missing `sub` in per-user mode is 403.

## Permissions

- **workspace-write** — Linux stays under `/workspace` and asks before
  mutating (`bash`, writes, `str_replace` create/replace). Reads, glob,
  grep, and `view` do not ask.
- **danger-full-access** — still confined to Sandbox `/workspace`;
  mutating tools do not ask.

Plan mode refuses mutating tools. There is no Unix account model and no
`users.yaml`.

## HTTP API

Worker-owned: `/api/login`, `/api/logout`, `/api/me`,
`POST /api/sessions/:id/answer` (Mailbox). Everything else is
`HarnessObject.fetch`.

Turns are `POST /api/sessions/:id/turn` with SSE (`text/event-stream`).
Cancel is `POST /api/sessions/:id/cancel`. Slash commands can also be
sent as the turn message (`/compact`, `/plan`, `/help`, …).
