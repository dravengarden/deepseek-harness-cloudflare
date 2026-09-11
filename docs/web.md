# Web surface and Cloudflare Access

Official `dsh web` (`@deepseek-ai/dsh-web-app`) is a Node GUI: process-token
cookie, Typert RPC, loopback Host fence. That binary does not run on
Workers. This host serves a Cloudflare-native Web surface over the same
harness `/api` (sessions, SSE turns, commands, settings, ask-user).

## Authentication

### Production: Cloudflare Access (required)

This is Cloudflare's official way to put identity in front of a Worker.
The Worker **must still validate** the JWT Access adds as
`Cf-Access-Jwt-Assertion` (do not trust email headers).

1. Deploy the Worker.
2. In the Worker dashboard, enable **Cloudflare Access** (one-click Access
   for Workers), or create a Zero Trust self-hosted application for the
   hostname.
3. Set Worker vars/secrets:
   - `TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com`
   - `POLICY_AUD` = the application's AUD tag
4. Add an Allow policy (your email, Google, GitHub, OTP, …).

The browser hits Access login first. The SPA then calls `/api/me` with the
JWT already on the request. Sign out goes to
`https://<team>.cloudflareaccess.com/cdn-cgi/access/logout`.

The Worker routes with `getByName(identityKey())`. Access decides *who may
use* the app. The architecture target is one HarnessObject and one Sandbox
per Access identity. The ship default is `IDENTITY_MODE` unset =
`shared-owner` (`"owner"`), so production is not per-user until an operator
flips.

Local `/api/login` (access-key cookie), Cloudflare Access, and `/api/logout`
are unchanged. There is no Typert RPC plane and no tenant picker.

### Local: access key

If `TEAM_DOMAIN` / `POLICY_AUD` are unset, `/api/login` accepts
`DSH_CF_ACCESS_KEY` and sets an HttpOnly cookie. That path is for
`wrangler dev` only.

### `GET /api/me`

Worker-only JSON (not a Durable Object). After JWT or access-key
verification it returns `{ ok, model, email, auth, identityKey, identityMode }`
and `sub` when the Access JWT has one. `LOCAL_DEV` does not gate these fields.

| Field | Meaning |
|---|---|
| `ok` | `true` |
| `model` | `DEEPSEEK_MODEL` or `deepseek-flash` (V4.1 Flash) |
| `email` | Display only. Never a tenant id. |
| `auth` | `"access"` or `"key"` |
| `identityKey` | Durable Object name from `identityKey()`: `owner`, `local`, or `user:<sub>` |
| `identityMode` | `"per-user"` only when `IDENTITY_MODE=per-user`; otherwise `"shared-owner"` (including unset) |
| `sub` | Access subject, included when present |

If `identityKey()` throws `IdentityError` (Access JWT missing `sub` in
`per-user` mode), `/api/me` is 403 like other `/api` routes.

The SPA shows `email` in the top bar and may show `identityKey` in the
composer hint. It does not send `identityKey` back or offer a tenant
picker. Cancel stays `POST /api/sessions/:id/cancel`.

## Permissions

The top-bar selector is the official dsh pair of presets:

- `workspace-write` — Linux tools stay in `/workspace` and **ask** before
  mutating (Allow / Deny via `ask_user_question`).
- `danger-full-access` — still confined to the Sandbox `/workspace` (there
  is no host filesystem to unlock); mutating tools do not ask.

There is no Unix account model and no `users.yaml`.

## Official GUI vs this host

Official `dsh-web-frontend`, Typert, and Node `dsh web` are **rejected**.
`@deepseek-ai/dsh-web-frontend` boots only after a Node host injects
`window.__ModuleLoader__` and `window.__DSH_BOOT__`, then talks Typert RPC
(`/api/remote.mux`, session.create/prompt, …). That host plane is not on
Workers. A Typert adapter in the Worker would be a second harness.

The GUI is the **Workers Assets SPA** in `public/`: official dark tokens
(`--dsw-*`, DeepSeek wordmark, 56px rail + session sidebar, composer) and
the official favicon, wired to this host's `/api`. It is not the React
slot client.

## UI

The SPA mirrors the official web *surface*, not the Node app:

- Session sidebar, fork, cancel, compact
- Streaming assistant text and thinking
- Tool calls, todos, ask-user prompts
- Slash-command menu from `/api/commands`
- Permission preset in the top bar
- Email in the top bar (display only; not a tenant id)

History replay uses settled events only (`assistant/message`, tools), not
live `assistant/chunk` rows, so reopening a session does not duplicate
streamed text.

