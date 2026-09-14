---
type: docs_index
description: DeepSeek Harness on Cloudflare Durable Objects.
---

# Documentation index

Read the root [README](../README.md) ([中文](../README.zh.md)) to run it.
Read [architecture](architecture.md) for the operator contract. Read the
[book](book/README.md) for the teaching narrative (English and 中文).

## Living design

| Doc | Role |
|---|---|
| [architecture.md](architecture.md) | System design: products, objects, turn, identity, security |
| [web.md](web.md) | Desktop `/` and chat `/m`, auth, `/api` |
| [containers.md](containers.md) | Sandbox sleep, ephemeral disk, backup/restore, measured cold start |
| [plugins.md](plugins.md) | How to mount a Cordis plugin on this host |
| [core-gaps.md](core-gaps.md) | Official DSH this runtime cannot take 1:1 |
| [sandbox-flyio.md](sandbox-flyio.md) | Fly Machines as an execution backend: feasibility, cost vs Containers |
| [site.md](site.md) | Documentation site: local build and GitHub Pages |

## Book

Bilingual teaching narrative. Same twelve chapters in each language.
Hub: [book/README.md](book/README.md).

English index: [book/en/INDEX.md](book/en/INDEX.md).

| # | English |
|---|---|
| 00 | [Preface](book/en/00-preface.md) |
| 01 | [The harness](book/en/01-harness.md) |
| 02 | [System map](book/en/02-system-map.md) |
| 03 | [Identity](book/en/03-identity.md) |
| 04 | [A turn](book/en/04-turn.md) |
| 05 | [Plugins](book/en/05-plugins.md) |
| 06 | [Linux sandbox](book/en/06-sandbox.md) |
| 07 | [Persistence](book/en/07-persistence.md) |
| 08 | [Latency](book/en/08-latency.md) |
| 09 | [Web surfaces](book/en/09-web.md) |
| 10 | [Security](book/en/10-security.md) |
| 11 | [Operate](book/en/11-operate.md) |
| 12 | [Limits and alternatives](book/en/12-limits.md) |

中文目录：[book/zh/INDEX.md](book/zh/INDEX.md)。

| # | 中文 |
|---|---|
| 00 | [前言](book/zh/00-preface.md) |
| 01 | [什么是 Harness](book/zh/01-harness.md) |
| 02 | [系统地图](book/zh/02-system-map.md) |
| 03 | [身份](book/zh/03-identity.md) |
| 04 | [一轮 Turn](book/zh/04-turn.md) |
| 05 | [插件](book/zh/05-plugins.md) |
| 06 | [Linux 沙箱](book/zh/06-sandbox.md) |
| 07 | [持久化](book/zh/07-persistence.md) |
| 08 | [延迟](book/zh/08-latency.md) |
| 09 | [Web 界面](book/zh/09-web.md) |
| 10 | [安全](book/zh/10-security.md) |
| 11 | [运维](book/zh/11-operate.md) |
| 12 | [限制与替代](book/zh/12-limits.md) |

## Historical

| Doc | Role |
|---|---|
| [design-cloudflare-native.md](design-cloudflare-native.md) | Original redesign plan (PRs 1–5). Historical. |

`AGENTS.md` at the repo root is for agents working in this tree, not for
operators.
