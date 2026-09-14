# 07 · Persistence

Native container disk is **ephemeral**. When the instance sleeps, the
next start has a fresh disk from the image. Whole-disk snapshots are
not public yet ([chapter 08](08-latency.md)). This host persists
`/workspace` with the Sandbox backup API.

```mermaid
sequenceDiagram
  participant Loop as HarnessObject
  participant SB as Sandbox DO
  participant Box as Container
  participant R2 as BACKUP_BUCKET

  Note over Box: idle 10 minutes
  SB->>Box: createBackup /workspace
  Box->>R2: squashfs (localBucket)
  SB->>SB: store DirectoryBackup handle
  SB->>Box: stop()
  Note over Box: disk gone
  Loop->>Box: exists /workspace/.dsh-cf
  Box-->>Loop: missing
  Loop->>Box: restoreBackup(handle)
  Box->>R2: get archive
  Box->>Box: unsquashfs
```

## Two official restore paths

| Handle | How restore works |
|---|---|
| Production (no `localBucket`) | FUSE overlay: squashfs as read-only lower layer |
| `localBucket: true` | Download archive through the R2 binding, `unsquashfs` |

This host always sets `localBucket: true` so backups work without
`CLOUDFLARE_ACCOUNT_ID` / R2 access keys. Restore **extracts**. That is
~1.3s today and grows with the tree. Official FUSE restore would stay
flatter, at the cost of S3 tokens.

The overlay (or the extracted tree) **vanishes on the next sleep**.
Store the `DirectoryBackup` handle (here: Sandbox DO storage) and
restore again. Restore only when `/workspace/.dsh-cf` is missing — the
documented “files gone after sleep” check. Restoring the same handle
while a FUSE overlay is still mounted would discard the upper layer.

## When backup runs

`Sandbox.onActivityExpired` (idle `sleepAfter = "10m"`) calls
`persistWorkspace()` then `stop()`. That is **one snapshot per sleep**,
not per model turn. `/checkpoint` is the same path by hand. TTL is 7
days. Replace-latest deletes the previous `backups/{id}/data.sqsh`.

A live R2 FUSE mount of `/data` is the other official persistence path.
Do not use it for `/workspace`; the backup API is the documented way to
bring that tree back.

Next: [Latency](08-latency.md).
