# 11 · Operate

## Local

Node 22+, Docker, Workers Paid (for production Containers), a DeepSeek
API key.

```bash
cp .dev.vars.example .dev.vars
# DEEPSEEK_API_KEY, DSH_CF_ACCESS_KEY, LOCAL_DEV=1
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock   # rootless
npx wrangler dev
npm run verify
```

The first Linux call builds `Dockerfile` and can take minutes.
Research-only turns do not start the container.

## Production

```bash
npx wrangler r2 bucket create dsh-cf-workspace-backups
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DSH_CF_ACCESS_KEY
npx wrangler deploy
```

`BACKUP_BUCKET` is bound; `localBucket: true`. No R2 API tokens
required. `workers.dev` on; `preview_urls` off.

Optional Access: create a Zero Trust app, then secret `TEAM_DOMAIN` and
`POLICY_AUD`. Then `/api/login` is disabled.

## Logs

```bash
npx wrangler tail
```

Useful `msg` values: `unauthorized`, `composeHarness after hibernation`,
turn start/end/cancel, ask timeout, sandbox restore hit/miss, sandbox
boot done (`wakeMs`, `restoreMs`), backup success/fail, sandbox
capacity.

Ops probes (auth required): `POST /api/sandbox/probe` times boot +
`uname`; `POST /api/sandbox/sleep` snapshots and `stop()`s.

## Cost sketch

Workers Paid is **$5/month**. Containers bill while **awake**: memory
and disk on provisioned `basic` size, CPU on active use. Sleep → those
meters stop. Included: 25 GiB-hours memory, 375 vCPU-minutes, 200
GB-hours disk. A teaching host that uses Linux a few hours a month
stays inside the included quota. `keepAlive` 24×7 does not.

Next: [Limits and alternatives](12-limits.md).
