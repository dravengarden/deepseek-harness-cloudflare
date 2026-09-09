import { Service, type Context } from "@deepseek-ai/cordis"

export class PlanModeService extends Service {
  static inject = ["sessions", "commands", "systemPrompt", "tools"]

  constructor(ctx: Context) {
    super(ctx, "plan")
    ctx.commands.register({
      name: "plan",
      description: "Enter plan mode, or /plan off to leave",
      run: async (args, sessionId) => {
        if (args.trim() === "off") {
          this.set(sessionId, false)
          return "Plan mode off."
        }
        this.set(sessionId, true)
        return args.trim()
          ? "Plan mode on. Continue with the rest of the message as the planning task."
          : "Plan mode on. Propose a plan; call exit_plan_mode when the user should approve it."
      },
    })
    ctx.systemPrompt.section({
      name: "plan:policy",
      order: 15,
      text: () => {
        const sessionId = ctx.tools.sessionId
        if (!sessionId || !this.active(sessionId)) return
        return `You are in plan mode. Do not run bash, write files, or take irreversible actions.
Research with web_search/web_fetch if needed. Write a concrete plan.
When the plan is ready for the user to approve, call exit_plan_mode with the plan text.`
      },
    })
    ctx.tools.register({
      name: "exit_plan_mode",
      description: "Leave plan mode after presenting a plan for the user to approve.",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "string", description: "The plan to present" },
        },
        required: ["plan"],
      },
      async execute(args) {
        const sessionId = ctx.tools.sessionId
        if (!sessionId) return "Error: exit_plan_mode requires an owning agent session"
        if (!ctx.plan.active(sessionId)) {
          return "Error: not in plan mode"
        }
        ctx.plan.set(sessionId, false)
        return `Plan mode off. Plan recorded:\n${String(args.plan ?? "")}`
      },
    })
  }

  active(sessionId: string): boolean {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) return false
    const event = [...session.events()].reverse().find((item) => item.type === "plan/mode")
    return Boolean((event?.payload as { active?: boolean } | undefined)?.active)
  }

  set(sessionId: string, active: boolean): void {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) throw new Error("session not found")
    session.append("plan/mode", { active })
  }
}
