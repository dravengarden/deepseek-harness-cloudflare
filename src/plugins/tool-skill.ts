import type { Context } from "@deepseek-ai/cordis"
import { isSkillName } from "../lib/skill-md.ts"

export const name = "tool-skill"
export const inject = ["tools", "skills", "sessions"]

export function apply(ctx: Context): void {
  ctx.tools.register({
    name: "skill",
    description:
      "Load the full instructions for an available skill by exact kebab-case name. Call this before acting on a catalog entry; do not infer instructions from the summary.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact skill name from the catalog" },
      },
      required: ["name"],
    },
    async execute(args) {
      const skillName = String(args.name ?? "").trim()
      if (!isSkillName(skillName)) return `Error: invalid skill name "${skillName}"`
      const skill = await ctx.skills.get(skillName)
      if (!skill) return `Error: skill "${skillName}" is unknown or no longer available`
      if (!skill.invocation.modelInvocable) {
        return `Error: skill "${skillName}" is not available for model invocation`
      }
      return ctx.skills.renderBody(skill)
    },
  })
}
