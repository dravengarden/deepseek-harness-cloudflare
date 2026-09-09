import { Service, type Context } from "@deepseek-ai/cordis"
import type { Session } from "./session.ts"

export class Agent {
  constructor(
    readonly ctx: Context,
    readonly session: Session,
  ) {}

  get id(): string {
    return this.session.id
  }
}

export class AgentRegistry extends Service {
  static inject = ["sessions"]
  private readonly live = new Map<string, Agent>()

  constructor(ctx: Context) {
    super(ctx, "agents")
  }

  register(agent: Agent): () => void {
    this.live.set(agent.id, agent)
    this.ctx.emit("agent/created", agent)
    return () => {
      this.live.delete(agent.id)
    }
  }

  get(id: string): Agent | undefined {
    return this.live.get(id)
  }

  list(): Agent[] {
    return [...this.live.values()]
  }

  ensure(session: Session): Agent {
    const existing = this.live.get(session.id)
    if (existing) return existing
    const agent = new Agent(this.ctx, session)
    this.register(agent)
    return agent
  }
}
