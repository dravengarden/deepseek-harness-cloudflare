# 11 · 运维

## 本地

Node 22+、Docker、Workers Paid（生产 Containers）、DeepSeek API 密钥。

```bash
cp .dev.vars.example .dev.vars
# DEEPSEEK_API_KEY, DSH_CF_ACCESS_KEY, LOCAL_DEV=1
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock   # rootless
npx wrangler dev
npm run verify
```

第一次 Linux 调用会构建 `Dockerfile`，可能要几分钟。只做调研的 turn 不会起容器。

## 生产

```bash
npx wrangler r2 bucket create dsh-cf-workspace-backups
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DSH_CF_ACCESS_KEY
npx wrangler deploy
```

`BACKUP_BUCKET` 已绑定；`localBucket: true`。不需要 R2 API token。
`workers.dev` 开；`preview_urls` 关。

可选 Access：建 Zero Trust 应用，再 secret `TEAM_DOMAIN` 和 `POLICY_AUD`。
然后 `/api/login` 禁用。

## 日志

```bash
npx wrangler tail
```

有用的 `msg`：`unauthorized`、`composeHarness after hibernation`、turn
start/end/cancel、ask 超时、sandbox restore hit/miss、sandbox boot done
（`wakeMs`、`restoreMs`）、backup success/fail、sandbox capacity。

运维探测（需鉴权）：`POST /api/sandbox/probe` 计 boot + `uname`；
`POST /api/sandbox/sleep` 快照并 `stop()`。

## 费用素描

Workers Paid **每月 $5**。Containers 只在**醒着**时计费：内存和盘按预置的
`basic` 规格，CPU 按实际使用。一睡，这些表就停。包含：25 GiB-小时内存、
375 vCPU-分钟、200 GB-小时盘。教学宿主一个月只用几小时 Linux，通常落在配额里。
`keepAlive` 24×7 则不是。

下一章：[限制与替代](12-limits.md)。
