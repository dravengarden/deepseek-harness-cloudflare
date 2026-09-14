# Cloudflare 上的 DeepSeek Harness

[English](README.md) | **中文**

一个跑在 **Workers** 上的 DeepSeek Harness 宿主。循环是 Cordis 插件树。会话日志是真相来源。Linux 跑在 Cloudflare Sandbox 里。这些都不是 Node，也不是 `npx @deepseek-ai/dsh`。

```text
Agent = Model + Harness
Harness = kernel + plugins
```

内核是官方 [`@deepseek-ai/cordis`](https://www.npmjs.com/package/@deepseek-ai/cordis)。其余缝——会话、LLM、工具、skills、日程、agent 循环——在 `fetch`、Durable Object SQLite 和 [`@cloudflare/sandbox`](https://developers.cloudflare.com/sandbox/) 上实现。

这是一份教学 / 演示级的 **harness 核心** port。它不是官方 CLI、Web GUI 或插件市场的替代品。

## 怎么拼起来的

```text
browser
  │  访问密钥 cookie，或 Cloudflare Access JWT
  ▼
Worker                 HTTP 入口、鉴权、identityKey() → getByName
  │
  ├── Assets           桌面 `/`  ·  手机/平板 `/m`
  ├── HarnessObject    Cordis 树 + SQLite 会话日志
  ├── ControlMailbox   ask_user_question 等待器
  └── Sandbox          Linux 容器、/workspace、空闲 10 分钟休眠
```

**必须有** Worker 脚本。Access、Assets、Durable Objects、Containers、R2 不能互相绑定。Worker 不是 agent 循环。循环在 `HarnessObject` 上。bash 在 Sandbox 里。

浏览器从不挑选 Durable Object id。鉴权之后，Worker 对 Harness、Mailbox、Sandbox 一起 `getByName(identityKey())`。

默认身份是 **shared-owner**（`IDENTITY_MODE` 未设 → `"owner"`）。按用户拆对象（`user:<sub>`）代码里有；只有运维设置 `IDENTITY_MODE=per-user` 才会打开。

完整设计：[`docs/architecture.md`](docs/architecture.md)。中英教学书：[`docs/book/README.md`](docs/book/README.md)。

## 界面

两个独立 SPA 共用一套 `/api`。不托管官方 `dsh-web-frontend`、Typert，也不跑 Node `dsh web`。

| URL | 谁 | 是什么 |
|---|---|---|
| `/` | 桌面 | 工作台：轨、会话栏、composer |
| `/m` | iPhone、iPad、Android 手机 | 聊天壳。iPad（≥768px）保留常驻会话列 |
| `/?ui=desktop` | 任何人 | 钉住工作台（`dsh_ui` cookie） |

手机和 iPad 访问 `/` 会转到 `/m`。历史回放只用已完成的事件，重新打开会话不会把流式文本再贴一遍。

## 这份 port 包含什么

| 缝 | 说明 |
|---|---|
| Cordis 4.x | 官方内核。没有 YAML Loader，没有 HMR |
| 会话日志 | 只追加的 SQLite，`deriveMessages()`，fork，删除 |
| 模型 | DeepSeek V4.1 Flash（`deepseek-flash`），thinking，工具 |
| Web | `web_search`（DeepSeek 服务端搜索），`web_fetch`（有 SSRF 门） |
| Linux | `/workspace` 里的 `bash`、文件、glob/grep、`str_replace_editor` |
| 工作区 | 空闲休眠时 `createBackup`，下次启动 restore |
| Skills | 目录、`skill` 工具、`/name`、内置 + `/workspace` SKILL.md |
| Subagent | 进程内 spawn / fork，最大深度 3 |
| Todo、日程、plan、问用户 | 日程用 Durable Object alarm |
| 权限 | `workspace-write`（先问）/ `danger-full-access`（不问） |
| 命令 | `/help` `/compact` `/plan` `/permission` `/workspace` `/checkpoint` |

官方 DSH 这套运行时不能 1:1 搬的，列在 [`docs/core-gaps.md`](docs/core-gaps.md)（PTY、LSP、MCP stdio、Loader、后台任务、视觉……）。第三方 `dsh plugin add` 包不能在这里挂载。写一个 Cordis 模块，加进 `src/compose.ts`。

## 限制

这些是这个宿主的平台事实，不是 DSH 功能待办。

| 限制 | 你会撞上什么 |
|---|---|
| Linux 休眠再醒 | `sleepAfter`（10 分钟）之后，第一次 Linux 工具大约等 **10 秒**：**约 8.8 秒** 等官方 `cloudflare/sandbox:0.12.9` 在 `basic`（¼ vCPU）上起来，再 **约 1.3 秒** `unsquashfs` `/workspace`。热路径 `uname` 约 **55ms**。登录和纯聊天不会起箱子。`prefetch()` 从 Linux `tool_call` 开始，不是一发送。没有按 prompt 关键词预热：那样只挡住约 2 秒的 DeepSeek，误唤醒会占一个 `max_instances` 槽 10 分钟。数字见 [`docs/containers.md`](docs/containers.md)。 |
| 整盘 snapshot | Cloudflare `persistAcrossSessions` / 机器 snapshot 仍是 **private beta**（文档到 2026-09 仍写 coming soon）。这里没用。GA 之后宣传的 restore 大约 **2 秒**，不是热路径 55ms。内存 snapshot（进程接着跑）更往后。 |
| 目录 backup | `/workspace` 的 `createBackup` / `restoreBackup` **已经上了**。生产用 `localBucket: true`，不用 R2 S3 token；restore 是**解压**不是 FUSE overlay，所以那 1.3 秒会随目录变大。休眠后盘是空的，直到 restore。 |
| 容量 | `max_instances` 是 **5 个正在跑的**容器，不是注册用户数。睡着的 sandbox 不占槽。默认身份是共用一个 `"owner"` sandbox。 |
| 身份 / Access | 运维设置之前 `IDENTITY_MODE=per-user` 是关的。`TEAM_DOMAIN` 和 `POLICY_AUD` 未设时 Cloudflare Access 关着；此时访问密钥 cookie 就是门，拿到 URL 和密钥的人共用 `"owner"`。 |
| Fly.io | 可以作为**第二**执行后端（Machines + guest agent），不是 `@cloudflare/sandbox` 的 drop-in。瘦 guest 加 volume 唤醒大约 **0.5–2 秒**，但停着的 rootfs 和 volume 空闲仍计费（各约 $0.15/GB/月）。不是默认。探索：[`docs/sandbox-flyio.md`](docs/sandbox-flyio.md)。 |
| 官方 DSH 表面 | 没有 PTY、LSP、MCP stdio、YAML Loader、后台任务、视觉，也没有 `dsh plugin add`。见 [`docs/core-gaps.md`](docs/core-gaps.md)。 |

不要把活着的容器当成永久机器。Cloudflare 仍可能 SIGTERM。把约 10 秒的唤醒压下去，靠的是官方整盘 snapshot，或在 `ctx.execution` 后面加可选 Fly SKU——不是把官方 sandbox 镜像换成 Alpine。

## 环境要求

- Node 22+（只给 Wrangler 和测试用；harness 不跑在 Node 上）
- [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/)（Containers）
- Docker，用于 `wrangler dev` 和推 Sandbox 镜像
- DeepSeek API 密钥

## 安装

```bash
git clone git@github.com:dravengarden/deepseek-harness-cloudflare.git
cd deepseek-harness-cloudflare
npm install
cp .dev.vars.example .dev.vars
```

填写 `.dev.vars`（不要提交）：

| 变量 | 本地 | 生产 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 必填 | `wrangler secret put` |
| `DSH_CF_ACCESS_KEY` | 必填，足够长的随机串 | 同上，直到打开 Access |
| `DEEPSEEK_MODEL` | 可选，默认 `deepseek-flash` | 可选 |
| `LOCAL_DEV=1` | 要设 | 不要设 |
| `TEAM_DOMAIN` / `POLICY_AUD` | 不要设 | 建好 Access 再设 |
| `IDENTITY_MODE` | 不要设（shared-owner） | 翻到 `per-user` 之前不要设 |

### 本地

Docker 必须在跑。Rootless / NixOS 常常需要：

```bash
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
npx wrangler dev
```

打开打印出的 URL，粘贴 `DSH_CF_ACCESS_KEY`，开一个会话。第一次 Linux 调用会构建 `Dockerfile`（`FROM docker.io/cloudflare/sandbox:0.12.9`），可能要几分钟。只做调研的 turn（`web_search` / `web_fetch`）不会起容器。

```bash
npm run verify
```

### 生产

```bash
npx wrangler r2 bucket create dsh-cf-workspace-backups
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DSH_CF_ACCESS_KEY
npx wrangler deploy
```

备份走 `BACKUP_BUCKET` binding（`localBucket: true`）。不需要 R2 API token。`preview_urls` 关。默认开 `workers.dev`。

`TEAM_DOMAIN` 和 `POLICY_AUD` 未设时，`/api/login` 接受访问密钥 cookie。设了之后 `/api/login` 禁用，Worker 用团队 JWKS 校验 `Cf-Access-Jwt-Assertion`。从不信任未签名的邮箱头。

## 身份

`identityKey()` 就是 Durable Object 的名字：

| 模式 | Access JWT | 访问密钥 |
|---|---|---|
| 未设 / `shared-owner` | `"owner"` | `"owner"` |
| `per-user` | `user:<sub>` | `"local"` |

邮箱只用于展示。生产 per-user 用 Access `sub`。可选 `LEGACY_OWNER_SUB` / `LEGACY_OWNER_EMAIL` 在翻转时把一个主体留在旧的 `"owner"` SQLite。回滚：去掉 `IDENTITY_MODE` 再部署。闲置的 `user:*` 对象会休眠，不会拷回去。

`max_instances` 是 **5 个并发正在跑的容器**，不是用户数。睡着的 sandbox 不占槽。

## 运维

```bash
npx wrangler tail
```

日志是一行 JSON，字段 `level`、`msg`、`identityKey`、`sessionId`、`route`、`doClass`、`elapsedMs`、`err`。JWT、访问密钥、`DEEPSEEK_API_KEY` 从不入日志。工具结果会截断。

有用的 `msg`：`unauthorized`、`composeHarness after hibernation`、turn start/end/cancel、ask timeout/cancelled、sandbox restore hit/miss、backup success/fail、sandbox capacity、schedule alarm。

## 插件

```ts
import type { Context } from "@deepseek-ai/cordis"

export const name = "acme"
export const inject = ["tools", "systemPrompt"]

export function apply(ctx: Context) {
  ctx.tools.register({
    name: "acme_lookup",
    description: "Look up an Acme record",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async execute(args) {
      return JSON.stringify({ id: args.id })
    },
  })
}
```

从 `composeHarness(env, sql, { identityKey, plugins: [acme] })` 挂上。缝：[`docs/plugins.md`](docs/plugins.md)。

## 文档

教学书（英文和中文，Mermaid 图）从 [`docs/book/README.md`](docs/book/README.md) 开始。活的设计文档仍是运维契约。阅读站用 `node site/build.mjs` 构建，部署到 GitHub Pages；见 [`docs/site.md`](docs/site.md)。

| 文档 | 作用 |
|---|---|
| [`docs/book/README.md`](docs/book/README.md) | 双语书：十二章，EN + 中文 |
| [`docs/architecture.md`](docs/architecture.md) | 系统设计：产品、对象、turn、身份 |
| [`docs/web.md`](docs/web.md) | SPA 界面、鉴权、`/api` |
| [`docs/containers.md`](docs/containers.md) | Sandbox 休眠、磁盘、backup/restore |
| [`docs/plugins.md`](docs/plugins.md) | 怎么写插件 |
| [`docs/core-gaps.md`](docs/core-gaps.md) | 官方 DSH 这套运行时不能 1:1 搬 |
| [`docs/sandbox-flyio.md`](docs/sandbox-flyio.md) | Fly Machines 与 Cloudflare Containers（探索） |
| [`docs/site.md`](docs/site.md) | 文档站和 GitHub Pages |
| [`docs/design-cloudflare-native.md`](docs/design-cloudflare-native.md) | 最初的重设计计划（历史） |

## 许可

MIT。Cordis 和 Sandbox SDK 各有许可证。本项目不是 DeepSeek 或 Cloudflare 的官方产品。
