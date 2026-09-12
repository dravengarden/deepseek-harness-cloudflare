import { Sandbox as CloudflareSandbox, type DirectoryBackup } from "@cloudflare/sandbox"
import { log } from "./lib/log.ts"
import { WORKSPACE_ROOT } from "./lib/workspace-path.ts"

const HANDLE_KEY = "workspace_backup"
/** Official long-lived backup example: 7 days. */
const BACKUP_TTL_SECONDS = 604_800

interface SandboxEnv {
  BACKUP_BUCKET: R2Bucket
  LOCAL_DEV?: string
}

/**
 * Official Sandbox class plus the documented idle hook.
 * `onActivityExpired` runs when `sleepAfter` elapses; default is `stop()`.
 * Persist `/workspace` there so we pay for one backup per sleep, not per turn.
 */
export class Sandbox extends CloudflareSandbox<SandboxEnv> {
  sleepAfter = "10m"

  async onActivityExpired(): Promise<void> {
    const identityKey = this.ctx.id.name ?? "owner"
    const started = Date.now()
    try {
      await this.persistWorkspace()
      log({
        level: "info",
        msg: "sandbox backup success",
        identityKey,
        doClass: "Sandbox",
        elapsedMs: Date.now() - started,
      })
    } catch (error) {
      log({
        level: "error",
        msg: "sandbox backup fail",
        identityKey,
        doClass: "Sandbox",
        elapsedMs: Date.now() - started,
        err: error,
      })
    }
    await super.onActivityExpired()
  }

  async persistWorkspace(): Promise<DirectoryBackup> {
    const previous = await this.loadWorkspaceBackup()
    const backup = await this.createBackup({
      dir: WORKSPACE_ROOT,
      name: "workspace",
      ttl: BACKUP_TTL_SECONDS,
      // BACKUP_BUCKET is always bound; skip presigned-URL tokens.
      localBucket: true,
    })
    await this.ctx.storage.put(HANDLE_KEY, backup)
    if (previous && previous.id !== backup.id) {
      try {
        await this.env.BACKUP_BUCKET.delete([
          `backups/${previous.id}/data.sqsh`,
          `backups/${previous.id}/meta.json`,
        ])
      } catch {
        // Leftovers expire via TTL / R2 lifecycle.
      }
    }
    return backup
  }

  async loadWorkspaceBackup(): Promise<DirectoryBackup | null> {
    return (await this.ctx.storage.get<DirectoryBackup>(HANDLE_KEY)) ?? null
  }
}
