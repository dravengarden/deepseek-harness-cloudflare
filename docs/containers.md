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

## Cold start vs warmup

Linux is already lazy: login, session list, and a chat-only turn do not
start the container. `AgentLoop` calls `execution.prefetch()` as soon as
a Linux `tool_call` delta arrives, so wake overlaps the rest of the LLM
stream and any Allow/Deny prompt. That path has no false positives.

Production, 2026-09-13, `maa05`, image `cloudflare/sandbox:0.12.9`,
`basic`. Auth-gated `POST /api/sandbox/probe` times `ready()` (`bootMs`)
then `uname` (`execMs`). `POST /api/sandbox/sleep` snapshots `/workspace`
and `stop()`s so the next probe is a true sleep-wake.

Sleep-wake `boot()` breakdown (restore **hit**, extra mkdir/marker RPCs skipped):

| Step | ms | What |
|---:|---:|---|
| `handleMs` | 13 | Sandbox DO `loadWorkspaceBackup()` |
| `wakeMs` | **8768** | First container RPC (`exists`): provision Firecracker + wait for sandbox port 3000 + default session |
| `restoreMs` | **1288** | `restoreBackup` with `localBucket: true` (R2 binding → write squashfs → `unsquashfs`) |
| `ensureMs` | 0 | skipped on restore hit |
| `execMs` | 58 | `uname` after the box is up |
| **boot total** | **10056** | |

| Path | bootMs | execMs | notes |
|---|---:|---:|---|
| After explicit `stop()` | **~10s** | ~55 | ~8.8s wake + ~1.3s extract |
| Chat turn after `stop()` (prefetch at `tool_call`) | — | **7732** wait after `tool/call` | LLM to `tool_call` **2119ms**; first `tool/result` **9851ms** |
| Same isolate, box already up | **0** | ~55 | cached `bootPromise` |
| Chat turn, box already up | — | **313** wait after `tool/call` | permissions + tool wrap; LLM **2–4s** |

Cloudflare documents container cold starts in the **1–3s** range. The
~8.8s wake is the official image coming up in `maa05`, not our loop.
`uname` itself is ~55ms either way.

### What is worth changing

| Change | Expected win | Cost |
|---|---|---|
| Skip extra exists/mkdir/writeFile after restore (**done**) | ~0.5–0.8s | none |
| Production FUSE overlay restore (`localBucket` only for `wrangler dev`) | restore ~1.3s → mount (~0.2–0.5s); stays flat as `/workspace` grows | needs R2 S3 tokens (`CLOUDFLARE_ACCOUNT_ID` + access key) |
| `transport: "rpc"` | slightly faster restore write (stream vs HTTP base64) | SDK path change; measure first |
| Longer `sleepAfter` (e.g. 30m) | fewer 10s hits | `basic` instance stays billed idle longer |
| `keepAlive: true` | no sleep-wake | instance never sleeps; must `destroy()` |
| Session-open / first-keystroke `prefetch()` | hides the 8.8s behind typing | one `max_instances` slot per identity |
| Prompt-keyword prefetch on send | hides ~2s of LLM only | false positives hold a slot 10m |
| Custom slimmer image | maybe closer to CF's 1–3s | leave official `cloudflare/sandbox` |

Do **not** expect to turn 8.8s into 1s from harness code. That wait is
container provision + the sandbox daemon. Hide it or sleep less often.

### Image size vs entrypoint

`docker.io/cloudflare/sandbox:0.12.9` is **not** the hello-world image the
1–3s FAQ was measured on. Local inspect: **~225MB** image bytes, Docker
reports **~850MB** virtual; layers include Debian, Node (~125MB), Bun
(~100MB), the sandbox control-plane binary (~100MB), and `cloudflared`.
Our Carrack scanners are ~11MB by comparison.

Cloudflare pre-fetches images onto nodes, and our sleep-wake is still
~8.8s — so this is **not** an image *pull*. It is start + entrypoint on
`basic` (¼ vCPU). The official image also sets
`JAVASCRIPT_POOL_MIN_SIZE=3` and `TYPESCRIPT_POOL_MIN_SIZE=3` (Python
pool 0), so the daemon may pre-spawn interpreter workers before port
3000 is ready.

Community pattern on Cloudflare Containers: keep warm (`keepAlive` /
healthcheck), wait for disk snapshots, or shrink *your own* app image.
Do not replace the official sandbox image with Alpine; the SDK requires
that control plane. A safe experiment is overriding the pool env vars to
`0` in our Dockerfile if we do not use the JS/TS interpreter.

A prompt-keyword / “looks like Linux” warmup on **every user message is
not worth adding**. DeepSeek already spends ~2s before the first
`tool_call`. Starting the box at send time only hides that 2s; the user
still waits ~6–8s after seeing `bash`. A wrong guess holds a `basic`
instance until `sleepAfter` (10m) and occupies a `max_instances` slot.

The only heuristic with a window large enough to hide ~8–10s is
**session-open / first keystroke** warmup (user is typing while the box
comes up). That is optional and identity-sensitive: fine while
`IDENTITY_MODE` is shared-owner (one sandbox); expensive once per-user
sandboxes share `max_instances: 5`. Leave it off until logs show
sleep-wake is the common path.

Do **not** start Linux on `/api/login`. Cloudflare can still SIGTERM a
running instance for platform reasons. Do not treat a live container as
a permanent machine.

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

Official production restore (no `localBucket`) is a FUSE overlay that
**vanishes on the next sleep**. This host currently sets
`localBucket: true` even in production so backups work without R2 S3
tokens; restore then **extracts** with `unsquashfs` (~1.3s today, grows
with `/workspace`). Store the `DirectoryBackup` handle and restore
again. Restore only when `/workspace/.dsh-cf` is missing — the documented
“files gone after sleep” check. On the FUSE path, restoring the same
handle while the overlay is still mounted would discard the upper layer.

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
