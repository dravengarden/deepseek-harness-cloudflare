import { Service, type Context } from "@deepseek-ai/cordis"
import type { CommandDefinition } from "../types.ts"

export class CommandService extends Service {
  private readonly commands = new Map<string, CommandDefinition>()

  constructor(ctx: Context) {
    super(ctx, "commands")
    this.register({
      name: "help",
      description: "List available slash commands",
      run: async () => this.list()
        .map((command) => `/${command.name} — ${command.description}`)
        .join("\n"),
    })
  }

  register(command: CommandDefinition): () => void {
    const name = command.name.replace(/^\//, "")
    this.commands.set(name, { ...command, name })
    return this.ctx.effect(() => () => {
      this.commands.delete(name)
    })
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()]
  }

  has(name: string): boolean {
    return this.commands.has(name.replace(/^\//, ""))
  }

  async run(raw: string, sessionId: string): Promise<string> {
    const trimmed = raw.trim()
    const match = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/)
    if (!match) throw new Error("not a command")
    const name = match[1]!
    const args = match[2] ?? ""
    const command = this.commands.get(name)
    if (!command) throw new Error(`unknown command: /${name}`)
    return command.run(args, sessionId)
  }
}
