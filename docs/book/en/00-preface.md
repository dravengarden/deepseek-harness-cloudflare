# 00 · Preface

This book is a guided tour of **deepseek-harness-cloudflare**: a
Workers-native host for DeepSeek Harness. It is written for engineers who
will run, extend, or argue with the port — not for people who only want
`npx @deepseek-ai/dsh`.

The official CLI is a Node process. This host is not. The kernel is still
official [`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis).
The rest of the harness — session log, tools, Linux, the GUI — is
implemented here on Durable Objects, Workers Assets, and
[Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/).

```text
Agent = Model + Harness
Harness = kernel + plugins
```

If that split is already obvious, skip to [chapter 02](02-system-map.md).
If you only need to deploy, the root [README](../../../README.md)
([中文](../../../README.zh.md)) is enough. Come back here when the first
Linux tool takes ten seconds and you want to know why.

## How the two languages work

English and Chinese are **peer editions**. Chapter numbers match. Diagrams
use the same topology; labels follow the chapter language. Neither edition
is generated from the other at build time — if they drift, treat the
living design docs as the source of truth.

| Language | Path |
|---|---|
| English | `docs/book/en/` |
| 中文 | `docs/book/zh/` |
| Hub | [`docs/book/README.md`](../README.md) |

## What is a living doc

The book tells a story. These files are the contract:

| File | Read it for |
|---|---|
| [`architecture.md`](../../architecture.md) | Objects, identity, turn |
| [`web.md`](../../web.md) | `/` and `/m`, `/api` |
| [`containers.md`](../../containers.md) | Sleep, disk, measured cold start |
| [`plugins.md`](../../plugins.md) | How to mount a plugin |
| [`core-gaps.md`](../../core-gaps.md) | Official DSH this runtime will not take 1:1 |
| [`sandbox-flyio.md`](../../sandbox-flyio.md) | Fly as a second backend |

If the book and a living doc disagree, the living doc wins.

## Shape of the book

- **01–02** — idea and map
- **03–05** — who you are, one turn, plugins
- **06–08** — Linux, persistence, the ten-second wake
- **09–11** — GUI, security, operations
- **12** — limits, snapshots, Fly, what not to build

Mermaid diagrams render on GitHub and most Markdown previews. They are
the architecture pictures; the tables are the numbers.

## Status of the port

Teaching / demo-grade harness core. Shared-owner identity by default.
Linux in `@cloudflare/sandbox@0.12.9` on Containers `basic`. Not an
official DeepSeek or Cloudflare product.

Next: [The harness](01-harness.md).
