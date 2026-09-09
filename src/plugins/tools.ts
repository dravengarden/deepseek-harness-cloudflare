import { Service, type Context } from "@deepseek-ai/cordis"
import type { ToolDefinition } from "../types.ts"

export class ToolService extends Service {
  readonly definitions = new Map<string, ToolDefinition>()
  sessionId: string | undefined

  constructor(ctx: Context) {
    super(ctx, "tools")
  }

  register(tool: ToolDefinition): () => void {
    this.definitions.set(tool.name, tool)
    return this.ctx.effect(() => () => {
      this.definitions.delete(tool.name)
    })
  }

  schemas(): Array<{
    type: "function"
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }> {
    return [...this.definitions.values()].map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
  }

  async execute(name: string, argsJson: string, signal?: AbortSignal): Promise<string> {
    const tool = this.definitions.get(name)
    if (!tool) return JSON.stringify({ error: `unknown tool: ${name}` })
    let args: Record<string, unknown> = {}
    try {
      args = argsJson ? JSON.parse(argsJson) as Record<string, unknown> : {}
    } catch {
      return JSON.stringify({ error: "tool arguments were not valid JSON" })
    }
    this.ctx.emit("tools/pre-execute", name, args)
    this.ctx.emit("tools/execute", name, args)
    try {
      await this.ctx.permissions.approve(name, args)
      const result = await tool.execute(args, signal)
      this.ctx.emit("tools/post-execute", name, result)
      return result
    } catch (error) {
      const result = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      this.ctx.emit("tools/post-execute", name, result)
      return result
    }
  }
}
