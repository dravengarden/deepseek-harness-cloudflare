import type { Agent, AgentRegistry } from "./plugins/agents.ts"
import type { AgentLoop } from "./plugins/agent-loop.ts"
import type { CommandService } from "./plugins/commands.ts"
import type { CompactionService } from "./plugins/compaction.ts"
import type { ExecutionService } from "./plugins/execution.ts"
import type { LlmRuntime } from "./plugins/llm.ts"
import type { PermissionService } from "./plugins/permissions.ts"
import type { PlanModeService } from "./plugins/plan-mode.ts"
import type { QuestionService } from "./plugins/questions.ts"
import type { ScheduleRecord, ScheduleService } from "./plugins/schedule.ts"
import type { SubagentService } from "./plugins/subagents.ts"
import type { SessionService } from "./plugins/session.ts"
import type { SettingsService } from "./plugins/settings.ts"
import type { SkillService } from "./plugins/skills.ts"
import type { SystemPromptService } from "./plugins/system-prompt.ts"
import type { ToolService } from "./plugins/tools.ts"
import type { WebRuntime } from "./plugins/web.ts"
import type { SessionEvent } from "./types.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    sessions: SessionService
    agents: AgentRegistry
    llm: LlmRuntime
    web: WebRuntime
    tools: ToolService
    systemPrompt: SystemPromptService
    commands: CommandService
    settings: SettingsService
    schedule: ScheduleService
    skills: SkillService
    compaction: CompactionService
    agentLoop: AgentLoop
    execution: ExecutionService
    subagents: SubagentService
    questions: QuestionService
    plan: PlanModeService
    permissions: PermissionService
  }

  interface Events {
    "session/event"(sessionId: string, event: SessionEvent): void
    "agent/created"(agent: Agent): void
    "agent/turn-start"(agent: Agent): void
    "agent/turn-end"(agent: Agent): void
    "tools/pre-execute"(name: string, args: Record<string, unknown>): void
    "tools/execute"(name: string, args: Record<string, unknown>): void
    "tools/post-execute"(name: string, result: string): void
    "settings/change"(namespace: string, document: Record<string, unknown>): void
    "schedule/due"(item: ScheduleRecord): void
  }
}

export {}
