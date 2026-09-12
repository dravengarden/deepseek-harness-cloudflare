import { Service, type Context } from "@deepseek-ai/cordis"
import { randomId } from "../lib/ids.ts"
import { toolMutates } from "../lib/tool-mutate.ts"

export type PermissionPreset = "workspace-write" | "danger-full-access"

export class PermissionService extends Service {
  static inject = ["settings", "questions", "sessions", "commands", "plan"]

  constructor(ctx: Context) {
    super(ctx, "permissions")
    ctx.commands.register({
      name: "permission",
      description: "Set workspace-write (ask) or danger-full-access (never ask)",
      run: async (args) => {
        const preset = args.trim() as PermissionPreset
        if (preset !== "workspace-write" && preset !== "danger-full-access") {
          return `current: ${this.preset()}`
        }
        this.setPreset(preset)
        return `permission preset: ${preset}`
      },
    })
  }

  preset(): PermissionPreset {
    const document = this.ctx.settings.get("permission", { preset: "workspace-write" as PermissionPreset })
    return document.preset === "danger-full-access" ? "danger-full-access" : "workspace-write"
  }

  setPreset(preset: PermissionPreset): void {
    this.ctx.settings.set("permission", { preset })
  }

  async approve(name: string, args: Record<string, unknown>): Promise<void> {
    const sessionId = this.ctx.tools.sessionId
    if (sessionId && this.ctx.plan.active(sessionId) && toolMutates(name, args)) {
      throw new Error("plan mode blocks mutating tools; call exit_plan_mode first")
    }
    if (this.preset() === "danger-full-access") return
    if (!toolMutates(name, args)) return
    if (!sessionId) return
    const session = this.ctx.sessions.get(sessionId)
    if (!session) return
    const id = randomId("ask")
    const question = `Allow tool \`${name}\`?\n${JSON.stringify(args).slice(0, 500)}`
    session.append("ask/question", { id, question, options: ["Allow", "Deny"] })
    const answer = await this.ctx.questions.ask(sessionId, id, 5 * 60_000, this.ctx.tools.signal)
    session.append("ask/answer", { id, answer })
    if (answer.trim().toLowerCase() !== "allow") {
      throw new Error("permission denied")
    }
  }
}
