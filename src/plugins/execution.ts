import { BackupExpiredError, BackupNotFoundError, getSandbox } from "@cloudflare/sandbox"
import { Service, type Context } from "@deepseek-ai/cordis"
import { log } from "../lib/log.ts"
import { isSandboxCapacityError, SANDBOX_CAPACITY_MESSAGE } from "../lib/sandbox-capacity.ts"
import { WORKSPACE_MARKER, WORKSPACE_ROOT, resolveWorkspacePath, workspaceParent } from "../lib/workspace-path.ts"
import type { Sandbox } from "../sandbox.ts"
import type { Env } from "../types.ts"

const OUTPUT_LIMIT = 24_000

export interface ExecutionConfig {
  env: Env
  identityKey: string
}

export interface ExecOutcome {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
}

export class ExecutionService extends Service {
  activated = false

  constructor(
    ctx: Context,
    private readonly config: ExecutionConfig,
  ) {
    super(ctx, "execution")
  }

  async bash(command: string, cwd?: string, signal?: AbortSignal): Promise<ExecOutcome> {
    return this.runLinux(async (sandbox) => {
      const result = await sandbox.exec(command, {
        cwd: cwd ? resolveWorkspacePath(cwd) : WORKSPACE_ROOT,
        timeout: 30_000,
      })
      return {
        success: result.success,
        exitCode: result.exitCode,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
      }
    })
  }

  async readFile(path: string): Promise<{ path: string; content: string }> {
    return this.runLinux(async (sandbox) => {
      const resolved = resolveWorkspacePath(path)
      const file = await sandbox.readFile(resolved)
      return { path: resolved, content: truncate(file.content) }
    })
  }

  async writeFile(path: string, content: string): Promise<{ path: string }> {
    return this.runLinux(async (sandbox) => {
      const resolved = resolveWorkspacePath(path)
      const parent = workspaceParent(resolved)
      if (parent) await sandbox.mkdir(parent, { recursive: true })
      await sandbox.writeFile(resolved, content)
      return { path: resolved }
    })
  }

  async listDir(path?: string, recursive = false): Promise<{
    path: string
    files: Array<{ name: string; type: string; size: number; path: string }>
  }> {
    return this.runLinux(async (sandbox) => {
      const resolved = resolveWorkspacePath(path, WORKSPACE_ROOT)
      const listing = await sandbox.listFiles(resolved, { recursive })
      return {
        path: resolved,
        files: listing.files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          path: file.absolutePath,
        })),
      }
    })
  }

  async mkdir(path: string): Promise<{ path: string }> {
    return this.runLinux(async (sandbox) => {
      const resolved = resolveWorkspacePath(path)
      await sandbox.mkdir(resolved, { recursive: true })
      return { path: resolved }
    })
  }

  async deleteFile(path: string): Promise<{ path: string }> {
    return this.runLinux(async (sandbox) => {
      const resolved = resolveWorkspacePath(path)
      await sandbox.deleteFile(resolved)
      return { path: resolved }
    })
  }

  /** Manual snapshot. Idle sleep also snapshots via Sandbox.onActivityExpired. */
  async checkpoint(): Promise<{ id: string; dir: string }> {
    const sandbox = this.sandbox()
    const backup = await sandbox.persistWorkspace()
    return { id: backup.id, dir: backup.dir }
  }

  private sandbox(): Sandbox {
    return getSandbox(this.config.env.Sandbox, this.config.identityKey, {
      sleepAfter: "10m",
    })
  }

  private async runLinux<T>(op: (sandbox: Sandbox) => Promise<T>): Promise<T> {
    try {
      return await op(await this.ready())
    } catch (error) {
      this.failCapacity(error)
    }
  }

  private async ready(): Promise<Sandbox> {
    const sandbox = this.sandbox()
    this.activated = true
    try {
      const handle = await sandbox.loadWorkspaceBackup()
      const marker = await sandbox.exists(WORKSPACE_MARKER)
      if (handle && !marker.exists) {
        try {
          await sandbox.restoreBackup(handle)
          log({
            level: "info",
            msg: "sandbox restore hit",
            identityKey: this.config.identityKey,
            doClass: "Sandbox",
          })
        } catch (error) {
          if (!(error instanceof BackupExpiredError || error instanceof BackupNotFoundError)) {
            throw error
          }
          log({
            level: "info",
            msg: "sandbox restore miss",
            identityKey: this.config.identityKey,
            doClass: "Sandbox",
            err: error,
          })
        }
      } else if (!handle && !marker.exists) {
        log({
          level: "info",
          msg: "sandbox restore miss",
          identityKey: this.config.identityKey,
          doClass: "Sandbox",
        })
      }
      const root = await sandbox.exists(WORKSPACE_ROOT)
      if (!root.exists) await sandbox.mkdir(WORKSPACE_ROOT, { recursive: true })
      const present = await sandbox.exists(WORKSPACE_MARKER)
      if (!present.exists) await sandbox.writeFile(WORKSPACE_MARKER, "1")
      return sandbox
    } catch (error) {
      this.failCapacity(error)
    }
  }

  private failCapacity(error: unknown): never {
    if (error instanceof Error && error.message === SANDBOX_CAPACITY_MESSAGE) throw error
    if (isSandboxCapacityError(error)) {
      log({
        level: "error",
        msg: "sandbox capacity",
        identityKey: this.config.identityKey,
        doClass: "Sandbox",
        err: SANDBOX_CAPACITY_MESSAGE,
      })
      throw new Error(SANDBOX_CAPACITY_MESSAGE)
    }
    throw error
  }
}

function truncate(text: string): string {
  if (text.length <= OUTPUT_LIMIT) return text
  return `${text.slice(0, OUTPUT_LIMIT)}\n… truncated ${text.length - OUTPUT_LIMIT} bytes`
}
