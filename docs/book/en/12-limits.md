# 12 · Limits and alternatives

This chapter is the long form of the README **Limitations** table.

## Platform

| Limit | Reality |
|---|---|
| Sleep-wake Linux | ~10s (8.8s wake + 1.3s extract). Warm ~55ms |
| Whole-disk snapshot | Private beta. Not used. Advertised ~2s restore |
| `max_instances` | 5 running containers |
| Default identity | Everyone shares `"owner"` |
| Access | Off until `TEAM_DOMAIN` / `POLICY_AUD` |
| Image | Official sandbox; do not Alpine it |

## Official DSH this runtime will not take 1:1

PTY / persistent bash, Landlock, LSP, MCP stdio, background jobs,
continuable subagents, ACP/Codex/Claude children, workflow/ralph,
YAML Loader / HMR / `dsh plugin add`, PowerShell, vision. Full table:
[`core-gaps.md`](../../core-gaps.md). These are **non-goals**, not a
backlog.

## Fly.io as a second backend

Technically yes: Machines API + a guest HTTP agent + a volume or R2
tarball. Architecturally a second control plane.

| | Cloudflare Sandbox | Fly Machines |
|---|---|---|
| Wake | ~8.8s + restore | ~0.5–2s with a slim guest, cached Machine |
| Isolation | Container | Firecracker microVM |
| Sleep billing | **$0** on compute | Stopped rootfs + volumes still tick |
| API | `sandbox.exec` | REST + agent you write |
| 2 h Linux / day, 1 GiB | ~$0 extra on Paid | ~$0.5 compute + ~$0.15 volume |

Do **not** replace the default. A `/vm` flag or overflow when CF returns
capacity is the only shape that fits `ctx.execution`. Exploration:
[`sandbox-flyio.md`](../../sandbox-flyio.md).

## What to wait for

1. Cloudflare **disk snapshots** leaving private beta —
   `persistAcrossSessions`. That is the intended fix for “I slept and
   now I wait ten seconds.”
2. Optional session-open prefetch if logs show sleep-wake is the common
   path **and** identity stays shared-owner.
3. FUSE restore (`localBucket` only in `wrangler dev`) if `/workspace`
   grows and you are willing to store R2 S3 tokens.

Do not wait on prompt-keyword warmup. Do not wait on a custom slim
image. Do not wait on Fly unless you explicitly want a VM SKU.

## Glossary

| Term | Meaning |
|---|---|
| Harness | Kernel + plugins around a model |
| Cordis | Official plugin kernel |
| `identityKey` | Durable Object name |
| `deriveMessages()` | Log → model Chat messages |
| `sleepAfter` | Idle window before snapshot + stop |
| `localBucket` | Backup via R2 binding, extract on restore |
| `prefetch()` | Start `ready()` without awaiting |

End of the English edition. Chinese: [前言](../zh/00-preface.md). Living
design: [`architecture.md`](../../architecture.md).
