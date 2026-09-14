# The book

A teaching narrative of **DeepSeek Harness on Cloudflare**: why the host is
a Worker isolate plus a Sandbox container, how a turn runs, and where the
platform still hurts.

This is not a substitute for the living design docs. Those remain the
operator contract. The book is the story you read first. Operator
README: [English](../../README.md) · [中文](../../README.zh.md).

这本书是 **Cloudflare 上的 DeepSeek Harness** 的教学叙事：为什么宿主是
Worker isolate 加 Sandbox 容器、一轮 turn 怎么跑、平台现在卡在哪里。

它不替代活的设计文档。那些仍是运维契约。书是你先读的故事。运维 README：
[English](../../README.md) · [中文](../../README.zh.md)。

| | English | 中文 |
|---|---|---|
| Start | [Preface](en/00-preface.md) | [前言](zh/00-preface.md) |
| Index | [Chapters](en/INDEX.md) | [目录](zh/INDEX.md) |

## Chapters · 章节

Twelve chapters, same numbering in both languages. Diagrams use
[Mermaid](https://mermaid.js.org/).

十二章，中英编号一致。图用 Mermaid。

| # | English | 中文 |
|---|---|---|
| 00 | [Preface](en/00-preface.md) | [前言](zh/00-preface.md) |
| 01 | [The harness](en/01-harness.md) | [什么是 Harness](zh/01-harness.md) |
| 02 | [System map](en/02-system-map.md) | [系统地图](zh/02-system-map.md) |
| 03 | [Identity](en/03-identity.md) | [身份](zh/03-identity.md) |
| 04 | [A turn](en/04-turn.md) | [一轮 Turn](zh/04-turn.md) |
| 05 | [Plugins](en/05-plugins.md) | [插件](zh/05-plugins.md) |
| 06 | [Linux sandbox](en/06-sandbox.md) | [Linux 沙箱](zh/06-sandbox.md) |
| 07 | [Persistence](en/07-persistence.md) | [持久化](zh/07-persistence.md) |
| 08 | [Latency](en/08-latency.md) | [延迟](zh/08-latency.md) |
| 09 | [Web surfaces](en/09-web.md) | [Web 界面](zh/09-web.md) |
| 10 | [Security](en/10-security.md) | [安全](zh/10-security.md) |
| 11 | [Operate](en/11-operate.md) | [运维](zh/11-operate.md) |
| 12 | [Limits and alternatives](en/12-limits.md) | [限制与替代](zh/12-limits.md) |

## Living docs · 活文档

| Doc | Role |
|---|---|
| [architecture.md](../architecture.md) | System design |
| [web.md](../web.md) | SPA and `/api` |
| [containers.md](../containers.md) | Sleep, disk, measured cold start |
| [plugins.md](../plugins.md) | How to mount a plugin |
| [core-gaps.md](../core-gaps.md) | Official DSH this runtime will not take 1:1 |
| [sandbox-flyio.md](../sandbox-flyio.md) | Fly Machines exploration |
