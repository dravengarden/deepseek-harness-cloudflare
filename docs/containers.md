# Cloudflare Containers for the Linux execution world

The harness loop stays in `HarnessObject` (isolate + SQLite). Linux
capabilities — bash, a real filesystem, processes — run in the official
**Cloudflare Sandbox SDK** (`@cloudflare/sandbox@0.12.9`), the same split
official DSH uses for E2B.

This host does not subclass `Container`, does not keep the VM alive with
`keepAlive`, and does not mount R2 by hand. Wrangler, the image, sleep, and
workspace persistence follow the Sandbox docs.

## Official pieces

| Piece | What we use |
|---|---|
| Worker export | `export { Sandbox } from "@cloudflare/sandbox"` |
| Image | `FROM docker.io/cloudflare/sandbox:0.12.9` (must match the npm version) |
| Binding | `containers` + Durable Object `Sandbox` + migration `v2` |
| Client | `getSandbox(env.Sandbox, identityKey, { sleepAfter: "10m" })` |
| Commands / files | `exec`, `readFile`, `writeFile`, `listFiles`, `mkdir`, `deleteFile` |
| Sleep | default `sleepAfter = "10m"`, `keepAlive` left false |
| Workspace across sleep | `createBackup({ dir: "/workspace" })` / `restoreBackup(handle)` |

`nodejs_compat` is on because every official Sandbox wrangler template
includes it. Harness plugins still must not import `node:` APIs; the loop
is not a Node process.

`instance_type` is `basic` (1 GiB), not the hello-world `lite` (256 MiB), so
python/git/bash in the official image can actually run. `max_instances` is
`5`: concurrent *running* containers, not registered users. Sleeping
sandboxes do not consume a slot. Default identity is still shared-owner
(`"owner"`); per-user sandbox ids apply after `IDENTITY_MODE=per-user`.
A start that exceeds the cap fails Linux tools with
`sandbox capacity reached (max_instances); retry when another workspace sleeps`.

## Auto-shutdown

Yes. Sandbox / Container default is `sleepAfter = "10m"`. After that idle
window, `onActivityExpired()` calls `stop()`. Billing stops when it sleeps.

`keepAlive: true` disables that and heartbeats every 30 seconds. This host
does **not** set keepAlive. The sandbox starts on first Linux tool use and
is allowed to sleep.

Cloudflare can still SIGTERM a running instance for platform reasons. Do not
treat a live container as a permanent machine.

## Persistent filesystem

**Native container disk is not persistent.** Official Containers FAQ:

> All disk is ephemeral. When a Container instance goes to sleep, the next
> time it is started, it will have a fresh disk as defined by its container
> image.

Whole-disk snapshots are **coming soon**, not available yet.

Official Sandbox storage options today:

| Mechanism | Use when |
|---|---|
| Container disk | Live session only |
| `createBackup` / `restoreBackup` of `/workspace` | Project directory should come back after sleep |
| Bucket mount (`mountBucket`) | A **separate** path such as `/data` should persist independently |

Docs are explicit: restore in production is a FUSE overlay that **vanishes
on the next sleep**. Store the `DirectoryBackup` handle (KV, D1, or Durable
Object storage) and restore again. Restoring the same handle while the
overlay is still mounted discards the upper layer, so this host restores
only when `/workspace/.dsh-cf` is missing — the documented “files gone after
sleep” check.

Backup runs on the official Container hook `onActivityExpired` (idle
`sleepAfter = "10m"`), then `stop()`. That is one R2 snapshot per sleep, not
per model turn. `/checkpoint` calls the same `createBackup` path by hand.
The handle lives in the Sandbox Durable Object store.

Backups always use `localBucket: true` against the `BACKUP_BUCKET` binding
(local `wrangler dev` and production). Presigned-URL tokens
(`CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are
not required. TTL is 7 days. Replace-latest deletes the previous
`backups/{id}/data.sqsh` and `meta.json`.

A live R2 FUSE mount of `/data` is the other official persistence path. Do
not use it for `/workspace`; the backup API is the documented way to bring
that tree back.
