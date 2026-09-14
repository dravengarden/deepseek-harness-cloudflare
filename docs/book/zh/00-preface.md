# 00 · 前言

这本书是 **deepseek-harness-cloudflare** 的导览：一个跑在 Workers 上的
DeepSeek Harness 宿主。写给要运行、扩展、或跟它对线的工程师，不是只想
敲 `npx @deepseek-ai/dsh` 的人。

官方 CLI 是 Node 进程。这个宿主不是。内核仍是官方
[`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis)。
其余 harness——会话日志、工具、Linux、GUI——在 Durable Object、Workers
Assets 和 [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/)
上实现。

```text
Agent = Model + Harness
Harness = kernel + plugins
```

若这个拆分已经清楚，直接读[第 02 章](02-system-map.md)。若只想部署，根目录
[中文 README](../../../README.zh.md)（[English](../../../README.md)）够用。等第一次
Linux 工具等了十秒、你想知道为什么时，再回来。

## 两种语言怎么共存

中文和英文是**对等版本**。章节编号一致。图的结构相同，标签跟章节语言。
构建时不会从一种语言生成另一种——若有出入，以活的设计文档为准。

| 语言 | 路径 |
|---|---|
| English | `docs/book/en/` |
| 中文 | `docs/book/zh/` |
| 入口 | [`docs/book/README.md`](../README.md) |

## 什么是活文档

书讲故事。这些文件才是契约：

| 文件 | 读它为了 |
|---|---|
| [`architecture.md`](../../architecture.md) | 对象、身份、turn |
| [`web.md`](../../web.md) | `/` 与 `/m`、`/api` |
| [`containers.md`](../../containers.md) | 休眠、磁盘、测过的冷启动 |
| [`plugins.md`](../../plugins.md) | 怎么挂插件 |
| [`core-gaps.md`](../../core-gaps.md) | 官方 DSH 这套运行时不会 1:1 搬 |
| [`sandbox-flyio.md`](../../sandbox-flyio.md) | Fly 作为第二后端 |

书和活文档冲突时，活文档赢。

## 书的形状

- **01–02** — 想法和地图
- **03–05** — 你是谁、一轮 turn、插件
- **06–08** — Linux、持久化、那十秒
- **09–11** — GUI、安全、运维
- **12** — 限制、snapshot、Fly、不要做什么

Mermaid 图在 GitHub 和多数 Markdown 预览里能渲染。图是结构，表是数字。

## 这份 port 的定位

教学 / 演示级 harness 核心。默认共享 owner 身份。Linux 在
`@cloudflare/sandbox@0.12.9`、Containers `basic` 上。不是 DeepSeek 或
Cloudflare 的官方产品。

下一章：[什么是 Harness](01-harness.md)。
