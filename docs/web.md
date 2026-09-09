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

The harness is still **one owner** (`idFromName("owner")`). Access decides
*who may use* the app; it does not create per-user sandboxes.

### Local: access key

If `TEAM_DOMAIN` / `POLICY_AUD` are unset, `/api/login` accepts
`DSH_CF_ACCESS_KEY` and sets an HttpOnly cookie. That path is for
`wrangler dev` only.

## Permissions

The top-bar selector is the official dsh pair of presets:

- `workspace-write` — Linux tools stay in `/workspace` and **ask** before
  mutating (Allow / Deny via `ask_user_question`).
- `danger-full-access` — still confined to the Sandbox `/workspace` (there
  is no host filesystem to unlock); mutating tools do not ask.

There is no Unix account model and no `users.yaml`.

## UI

The SPA mirrors the official web *surface*, not the Node app:

- Session sidebar, fork, cancel, compact
- Streaming assistant text and thinking
- Tool calls, todos, ask-user prompts
- Slash-command menu from `/api/commands`
- Permission preset in the top bar

History replay uses settled events only (`assistant/message`, tools), not
live `assistant/chunk` rows, so reopening a session does not duplicate
streamed text.

