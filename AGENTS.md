# DeepSeek Harness on Cloudflare

Workers-native host. The Durable Object owns the plugin tree and session log.
Do not run the official `dsh` CLI or treat Node as the harness runtime.
`nodejs_compat` is present because the official Cloudflare Sandbox SDK
requires it; plugins still must not import `node:` APIs.

Linux (bash, `/workspace`) is the official `@cloudflare/sandbox` container,
not the Durable Object isolate. Sleep with `sleepAfter: "10m"` (no
`keepAlive`). Persist `/workspace` with `createBackup` on
`onActivityExpired`, then `restoreBackup` after the next start. Do not
snapshot every turn.

- Kernel: official `@deepseek-ai/cordis` only. Do not reintroduce a local kernel.
- Do not mount `@deepseek-ai/cordis-plugin-loader` or HMR.
- Runtime APIs: `fetch`, Web Crypto, Web Streams, Durable Object SQL.
- Plugins live under `src/plugins/` and mount through `src/compose.ts`.
  Third-party plugins use the same Cordis shapes and `ctx.*` seams; see
  `docs/plugins.md`.
- Session history for the model must come from `session.deriveMessages()`,
  never from an ad-hoc array that drops tool calls.
- Session events are the source of truth; the in-memory kernel is rebuilt
  after hibernation.
- Keep `DEEPSEEK_API_KEY` server-side. Production auth is Cloudflare Access
  JWT (`TEAM_DOMAIN`, `POLICY_AUD`); local auth is `DSH_CF_ACCESS_KEY`.
- Do not trust `Cf-Access-Authenticated-User-Email` without verifying the JWT.
- `just verify` / `npm run verify` is the project gate.
