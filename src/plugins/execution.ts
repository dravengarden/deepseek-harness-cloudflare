import { BackupExpiredError, BackupNotFoundError, getSandbox } from "@cloudflare/sandbox"
import { Service, type Context } from "@deepseek-ai/cordis"
import { WORKSPACE_MARKER, WORKSPACE_ROOT, resolveWorkspacePath, workspaceParent } from "../lib/workspace-path.ts"
import type { Sandbox } from "../sandbox.ts"
import type { Env } from "../types.ts"

const OWNER_SANDBOX_ID = "owner"
const OUTPUT_LIMIT = 24_000

export interface ExecutionConfig {
  env: Env
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
    const sandbox = await this.ready()
    const result = await sandbox.exec(command, {
      cwd: cwd ? resolveWorkspacePath(cwd) : WORKSPACE_ROOT,
      timeout: 30_000,
      signal,
    })
    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
    }
  }

  async readFile(path: string): Promise<{ path: string; content: string }> {
    const sandbox = await this.ready()
    const resolved = resolveWorkspacePath(path)
    const file = await sandbox.readFile(resolved)
    return { path: resolved, content: truncate(file.content) }
  }

  async writeFile(path: string, content: string): Promise<{ path: string }> {
    const sandbox = await this.ready()
    const resolved = resolveWorkspacePath(path)
    const parent = workspaceParent(resolved)
    if (parent) await sandbox.mkdir(parent, { recursive: true })
    await sandbox.writeFile(resolved, content)
    return { path: resolved }
  }

  async listDir(path?: string, recursive = false): Promise<{
    path: string
    files: Array<{ name: string; type: string; size: number; path: string }>
  }> {
    const sandbox = await this.ready()
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
  }

  async mkdir(path: string): Promise<{ path: string }> {
    const sandbox = await this.ready()
    const resolved = resolveWorkspacePath(path)
    await sandbox.mkdir(resolved, { recursive: true })
    return { path: resolved }
  }

  async deleteFile(path: string): Promise<{ path: string }> {
    const sandbox = await this.ready()
    const resolved = resolveWorkspacePath(path)
    await sandbox.deleteFile(resolved)
    return { path: resolved }
  }

  /** Manual snapshot. Idle sleep also snapshots via Sandbox.onActivityExpired. */
  async checkpoint(): Promise<{ id: string; dir: string }> {
    const sandbox = this.sandbox()
    const backup = await sandbox.persistWorkspace()
    return { id: backup.id, dir: backup.dir }
  }

  private sandbox(): Sandbox {
    return getSandbox(this.config.env.Sandbox, OWNER_SANDBOX_ID, {
      sleepAfter: "10m",
    })
  }

  private async ready(): Promise<Sandbox> {
    const sandbox = this.sandbox()
    this.activated = true
    const handle = await sandbox.loadWorkspaceBackup()
    const marker = await sandbox.exists(WORKSPACE_MARKER)
    if (handle && !marker.exists) {
      try {
        await sandbox.restoreBackup(handle)
      } catch (error) {
        if (!(error instanceof BackupExpiredError || error instanceof BackupNotFoundError)) {
          throw error
        }
      }
    }
    const root = await sandbox.exists(WORKSPACE_ROOT)
    if (!root.exists) await sandbox.mkdir(WORKSPACE_ROOT, { recursive: true })
    const present = await sandbox.exists(WORKSPACE_MARKER)
    if (!present.exists) await sandbox.writeFile(WORKSPACE_MARKER, "1")
    return sandbox
  }
}

function truncate(text: string): string {
  if (text.length <= OUTPUT_LIMIT) return text
  return `${text.slice(0, OUTPUT_LIMIT)}\n… truncated ${text.length - OUTPUT_LIMIT} bytes`
}
