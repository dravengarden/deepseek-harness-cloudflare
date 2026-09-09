import type { Context } from "@deepseek-ai/cordis"
import { MAX_SUBAGENT_DEPTH } from "./subagents.ts"

export const name = "tool-subagent"
export const inject = ["tools", "subagents", "systemPrompt"]

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "tool:subagent",
    order: 40,
    text: () =>
      `Use the subagent tool for focused independent work (research, analysis, a scoped implementation) so it does not consume this conversation's context. Default is a fresh child that does not see this conversation. Use inherit_parent: true to fork completed turns only.`,
  })

  ctx.tools.register({
    name: "subagent",
    description:
      "Delegate a self-contained task to a child agent in its own session. The child does not see this conversation unless inherit_parent is true. Intermediate child steps stay out of this transcript; you receive the final answer.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Self-contained task for the child" },
        inherit_parent: {
          type: "boolean",
          description: "If true, fork completed parent turns into the child (not the in-flight turn)",
        },
      },
      required: ["prompt"],
    },
    async execute(args, signal) {
      const prompt = String(args.prompt ?? "").trim()
      if (!prompt) return "Error: prompt is required"
      const parentId = ctx.tools.sessionId
      if (!parentId) return "Error: subagent requires an owning agent session"
      if (ctx.subagents.depth(parentId) >= MAX_SUBAGENT_DEPTH) {
        return `Error: subagent depth cap (${MAX_SUBAGENT_DEPTH}) reached`
      }
      try {
        const run = await ctx.subagents.run({
          parentId,
          prompt,
          inherit: Boolean(args.inherit_parent),
          signal,
        })
        return run.result
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}
