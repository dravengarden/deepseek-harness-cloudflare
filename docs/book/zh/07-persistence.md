# 07 · 持久化

容器本地盘是**临时的**。实例一睡，下次启动是镜像里的空白盘。整盘 snapshot
还没对公众开放（[第 08 章](08-latency.md)）。这个宿主用 Sandbox 的 backup API
保住 `/workspace`。

```mermaid
sequenceDiagram
  participant Loop as HarnessObject
  participant SB as Sandbox DO
  participant Box as 容器
  participant R2 as BACKUP_BUCKET

  Note over Box: 空闲 10 分钟
  SB->>Box: createBackup /workspace
  Box->>R2: squashfs（localBucket）
  SB->>SB: 存 DirectoryBackup handle
  SB->>Box: stop()
  Note over Box: 盘没了
  Loop->>Box: exists /workspace/.dsh-cf
  Box-->>Loop: 没有
  Loop->>Box: restoreBackup(handle)
  Box->>R2: 取归档
  Box->>Box: unsquashfs
```

## 两条官方 restore 路径

| Handle | Restore 怎么做 |
|---|---|
| 生产（不设 `localBucket`） | FUSE overlay：squashfs 做只读下层 |
| `localBucket: true` | 经 R2 binding 下载归档，再 `unsquashfs` |

这个宿主始终 `localBucket: true`，这样不用 `CLOUDFLARE_ACCOUNT_ID` / R2
access key。Restore 是**解压**。今天大约 1.3 秒，目录变大还会涨。官方 FUSE
restore 更平坦，但要 S3 token。

Overlay（或解出来的树）**下次一睡就没了**。把 `DirectoryBackup` handle 存下来
（这里：Sandbox DO storage），再 restore。只在 `/workspace/.dsh-cf` 缺失时
restore——文档里的「睡醒文件没了」检查。FUSE overlay 还挂着时再 restore 同一
handle，会丢掉上层。

## 何时备份

`Sandbox.onActivityExpired`（空闲 `sleepAfter = "10m"`）调用
`persistWorkspace()` 再 `stop()`。这是 **每次休眠一份快照**，不是每轮模型
一份。`/checkpoint` 是同一条路径的手动版。TTL 7 天。Replace-latest 会删掉
上一份 `backups/{id}/data.sqsh`。

把 R2 FUSE 挂到 `/data` 是另一条官方持久化路。不要用它当 `/workspace`；
backup API 才是把那棵树带回来的文档做法。

下一章：[延迟](08-latency.md)。
