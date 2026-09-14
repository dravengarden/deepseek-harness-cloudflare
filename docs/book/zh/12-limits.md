# 12 · 限制与替代

这一章是 README **Limitations** 表的展开。

## 平台

| 限制 | 现实 |
|---|---|
| Linux 休眠再醒 | 约 10s（8.8s 唤醒 + 1.3s 解压）。热约 55ms |
| 整盘 snapshot | Private beta。这里没用。宣传 restore 约 2s |
| `max_instances` | 5 个正在跑的容器 |
| 默认身份 | 所有人共用 `"owner"` |
| Access | 未设 `TEAM_DOMAIN` / `POLICY_AUD` 就关着 |
| 镜像 | 官方 sandbox；不要换成 Alpine |

## 官方 DSH 这套运行时不会 1:1 搬

PTY / 持久 bash、Landlock、LSP、MCP stdio、后台任务、可续 subagent、
ACP/Codex/Claude 子进程、workflow/ralph、YAML Loader / HMR / `dsh plugin add`、
PowerShell、视觉。全表：[`core-gaps.md`](../../core-gaps.md)。这些是
**非目标**，不是待办。

## Fly.io 作为第二后端

技术上可以：Machines API + guest HTTP agent + volume 或 R2 tar。架构上是
第二套控制面。

| | Cloudflare Sandbox | Fly Machines |
|---|---|---|
| 唤醒 | 约 8.8s + restore | 瘦 guest、已缓存的 Machine 约 0.5–2s |
| 隔离 | 容器 | Firecracker 微 VM |
| 休眠计费 | 计算 **$0** | 停着的 rootfs 和 volume 仍走表 |
| API | `sandbox.exec` | REST + 自己写的 agent |
| 每天 2 小时 Linux、1 GiB | Paid 上大约 $0 超额 | 计算约 $0.5 + volume 约 $0.15 |

**不要换掉默认。** 只有 `/vm` 开关，或 CF 返回容量错误时 overflow，才适合挂在
`ctx.execution` 后面。探索：[`sandbox-flyio.md`](../../sandbox-flyio.md)。

## 该等什么

1. Cloudflare **整盘 snapshot** 离开 private beta——`persistAcrossSessions`。
   这才是「睡了一觉等十秒」的正统解。
2. 若日志显示 sleep-wake 是常路 **并且** 身份仍是 shared-owner，再考虑打开
   session 时 prefetch。
3. 若 `/workspace` 变大、且愿意存 R2 S3 token，再生产走 FUSE restore
   （`localBucket` 只留给 `wrangler dev`）。

不要等 prompt 关键词预热。不要等自制瘦镜像。不要等 Fly，除非你明确要一个
VM SKU。

## 术语

| 词 | 意思 |
|---|---|
| Harness | 模型外面的内核 + 插件 |
| Cordis | 官方插件内核 |
| `identityKey` | Durable Object 名字 |
| `deriveMessages()` | 日志 → 模型 Chat 消息 |
| `sleepAfter` | 快照并 stop 前的空闲窗口 |
| `localBucket` | 经 R2 binding 备份，restore 时解压 |
| `prefetch()` | 启动 `ready()` 但不等待 |

中文版到此结束。英文：[Preface](../en/00-preface.md)。活的设计：
[`architecture.md`](../../architecture.md)。
