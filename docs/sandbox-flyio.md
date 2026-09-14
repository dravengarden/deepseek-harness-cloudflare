# Fly.io as the Linux sandbox (exploration)

Not a plan to migrate. This note asks whether Fly Machines (or Fly
Sprites) could replace Cloudflare Sandbox for `/workspace` and `bash`,
what it would cost, and where it is a worse or better fit than the
Containers we ship today.

The harness loop stays on `HarnessObject`. Only `ctx.execution` would
change.

## What this host actually needs from a sandbox

From [`containers.md`](containers.md) and `ExecutionService`:

| Need | Today (CF Sandbox) |
|---|---|
| Named instance per `identityKey` | `getSandbox(env.Sandbox, identityKey)` |
| `exec` / files under `/workspace` | SDK methods on the same object |
| Idle stop | `sleepAfter: "10m"`, then `onActivityExpired` |
| Pay ~nothing while asleep | Container billing stops on sleep |
| `/workspace` after sleep | `createBackup` → R2 → `restoreBackup` |
| Call from a Worker isolate | Durable Object binding, no extra token |
| Isolation from the host | Container; not the Worker FS |
| Local dev | `wrangler dev` + Docker |

There is no PTY, no persistent bash, no `max_instances` above 5 without
an operator change. Linux starts on first tool use.

## What Fly would be

**Fly Machines** are Firecracker microVMs with a REST API (`create` /
`start` / `stop` / `destroy`). They boot from an OCI image. They are not
a sandbox SDK. There is no `machine.exec()` equivalent you import from
npm. You would run a **guest agent** (HTTP on an internal port, or
`fly ssh`) and teach `ExecutionService` to talk to it.

**Fly Sprites** are Fly’s later “agent computer” product: Firecracker,
checkpoint/restore, not Docker-based. Closer to “a computer for the
agent” than to `sandbox.exec`. Different contract; not a drop-in for
`@cloudflare/sandbox`.

This note treats **Machines + a guest agent + a volume (or object
backup)** as the realistic substitute. Sprites are a possible second
backend if the product is “give the agent a VM,” not “exec this
command.”

## Feasibility

Technically yes. Architecturally it is a **second control plane**.

```text
HarnessObject
  ctx.execution.bash()
        │
        ├─ today:  env.Sandbox.getByName(identityKey) → sandbox.exec
        │
        └─ Fly:    Worker secret FLY_API_TOKEN
                   POST /v1/apps/…/machines  (create/start)
                   HTTP to guest :8080/exec   (your daemon)
                   stop/destroy after idle    (you schedule this)
```

| Topic | Feasible? | Cost of doing it |
|---|---|---|
| `exec` / files | Yes, if we ship a guest API in the image | We own protocol, auth, timeouts, streaming |
| Named per identity | Yes, Machine `name` or metadata = `identityKey` | Fly app + token in the Worker |
| Idle stop | Yes, `fly machine stop` or autostop | We own the idle timer (DO alarm). Fly does not give `onActivityExpired` |
| Sleep-to-zero **billing** | Partial | Stopped Machines still pay **rootfs** ($0.15/GB-month). Volumes bill even detached |
| Persist `/workspace` | Yes, Fly Volume **or** tar to R2 | Volume is simpler and always-on cost. R2 matches today’s backup story |
| Worker integration | HTTP egress to `api.machines.dev` | No binding. Token, retries, region, DNS. `wrangler dev` cannot see Fly without that token |
| Isolation | **Stronger** | Hardware VM vs CF container (shared kernel) |
| PTY / persistent bash | Easier than CF `exec` | SSH or a long-lived guest process; still not in the current host |
| Custom / user images | Easier | CF Sandbox is locked to the image you last deployed |
| `max_instances: 5` | Fly account limits instead | Removes the teaching-host cap; also removes a cost brake |
| Local loop | Worse | Two clouds. Docker-on-Fly or a local guest fake |

Abort of `exec`: a guest HTTP API can take a cancel; CF Sandbox RPC
cannot take `AbortSignal`. That is a small, real win.

Wake latency: Fly quotes Machines around **300ms**. Cloudflare Container
wake is typically **seconds**. For “first bash in a cold session” Fly
feels better. For “loop already has a warm sandbox” it does not matter.

## Cost (order of magnitude, 2026 list prices)

Numbers below are list prices, not a quote. Cloudflare: Workers Paid
plan plus Containers meters. Fly: no free plan for new orgs; Machines
billed per second while `started`.

### Cloudflare `basic` (what we ship)

Provisioned: **1 GiB RAM, ¼ vCPU, 4 GB disk**. Memory and disk bill on
provisioned size while the container is **awake**. CPU bills on **active
use** only. Sleep → **$0** on those meters. Included per month on Paid:
25 GiB-hours memory, 375 vCPU-minutes, 200 GB-hours disk, plus the **$5**
Workers Paid subscription.

Rough extra (beyond the $5) for **one** `basic` sandbox:

| Pattern | Awake time | Extra Containers $ |
|---|---|---|
| Teaching host, Linux a few hours/month | inside included quotas | ~$0 |
| Interactive, ~2 h/day | ~60 GiB-h memory | ~$0.3–1 |
| Forgotten `keepAlive`, 24×7 | 720 GiB-h | ~$7–10 |

Sleeping sandboxes are the point of this host. Ten sleeping users cost
**R2 snapshot bytes**, not ten VMs.

### Fly `shared-cpu-1x` @ 1 GiB (closest size)

Started compute is about **$5.7–6/month if 24×7** (~$0.008/hour). Per
second while started, so 2 h/day is ~**$0.50** compute.

Then the idle line items this host would actually hit:

| Line | When it bills | ~$ |
|---|---|---|
| Stopped Machine rootfs | Every hour the Machine exists but is stopped | **$0.15 / GB rootfs / 30 days** |
| Fly Volume for `/workspace` | As long as the volume exists | **$0.15 / GB / month** |
| Snapshots | If you snapshot volumes | $0.08 / GB / month after 10 GB free |

Destroying the Machine when idle avoids rootfs, but then every Linux
turn is a create+boot, and `/workspace` must live on a Volume or in
object storage anyway. **N named sandboxes ⇒ N volumes** if you want
“files still there when they come back,” unless you do CF-style
backup/restore onto one bucket.

### Same workload, side by side

Assume **one identity**, Linux **2 hours/day**, **1 GiB** working set,
image/rootfs ~**1 GB**, **1 GB** persisted workspace. 30-day month.

| | Cloudflare Sandbox `basic` | Fly Machine + 1 GB volume |
|---|---|---|
| Compute while running | Inside Paid quotas or <$1 | ~$0.50 |
| While asleep | **$0** | Volume $0.15 + stopped rootfs $0.15 if you `stop` instead of destroy |
| Persist `/workspace` | R2 snapshot (pennies) | Volume (always) or DIY tar |
| Platform fee | $5 Workers Paid (already required) | Fly org, card on file, no $5 analog |
| 10 sleeping users | ~$0 extra compute | **~$3+** in volumes/rootfs even if nobody types |

Fly is cheaper **if the VM stays started and busy**. Cloudflare is
cheaper **if the VM is asleep most of the time**, which is this host.

Egress: Fly NA/EU **$0.02/GB**; CF Containers NA/EU **$0.025/GB** with a
large included allotment on Paid. Irrelevant until the agent pulls
multi-GB artifacts.

## Comparison (not a score)

| | Cloudflare Sandbox | Fly Machines |
|---|---|---|
| Isolation | Container (shared kernel) | Firecracker microVM (own kernel) |
| API from this host | `sandbox.exec` in-process | REST + guest agent you write |
| Identity | Same `identityKey` as the DO | Second namespace (Fly app + machine name) |
| Sleep billing | Stops | Rootfs + volumes keep ticking |
| Disk after sleep | Ephemeral; we snapshot | Volume can outlive the Machine |
| Wake | Seconds, same account | ~300ms claimed, cross-cloud HTTP |
| Image | One image per Worker deploy | Per-machine image; easier custom/user images |
| PTY / SSH | Not in this host (SDK has been growing PTY) | Native-ish |
| GPU | Not this instance type | Available on Fly |
| `wrangler dev` | One command | Fly token + network from the isolate |
| Lock-in | High (SDK + DO + R2 handle) | Lower VM, higher DIY |
| Untrusted tenant code | Weaker story | Stronger story |

Cloudflare is explicit that it will not beat Fly/AWS at VMs, and that
the agent should live in an isolate with a container borrowed when Linux
is required. That is already how this repo is shaped.

## Recommendation for this repo

**Do not replace Sandbox with Fly** for the teaching host.

1. The cost model we chose (sleep 10 minutes, snapshot once, restore
   next start) is the one CF meters well and Fly meters poorly.
2. `ExecutionService` is a thin wrapper around an official SDK. Fly
   would be a second product: guest image, token, idle controller,
   health, regions.
3. `max_instances: 5` is an operator brake. Fly would remove it and
   also remove the corresponding cost ceiling unless we reimplement one.
4. Isolation is the one place Fly wins clearly (Firecracker vs
   container). That matters if we ever run **other people’s** code in
   **their** workspace. Shared-owner `"owner"` plus our own key is not
   that product yet.

If we ever grow a second execution backend, keep it behind
`ctx.execution` and add Fly as an **overflow or VM SKU**, not as the
default:

- Overflow when CF returns the capacity string
- A `/vm` or settings flag for “I need a real Firecracker and a volume”
- Still snapshot to R2 if we want one backup story

Sprites are worth a separate look only if the product becomes “the
agent has a computer,” including PTY and checkpoint, which we currently
list as non-goals in [`core-gaps.md`](core-gaps.md).

## Sources

List prices change by region and date. Recheck before budgeting.

- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/) (passes through Containers)
- [Fly.io resource pricing](https://fly.io/docs/about/pricing/)
- [Fly.io Machine billing](https://fly.io/docs/about/billing/)
- [Fly Machines API / sizing](https://fly.io/docs/machines/guides-examples/machine-sizing/)
