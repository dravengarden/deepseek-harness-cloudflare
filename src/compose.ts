import { Context, type Plugin } from "@deepseek-ai/cordis"
import "./context.ts"
import { AgentLoop } from "./plugins/agent-loop.ts"
import { AgentRegistry } from "./plugins/agents.ts"
import * as briefing from "./plugins/briefing.ts"
import { CommandService } from "./plugins/commands.ts"
import { CompactionService } from "./plugins/compaction.ts"
import { ExecutionService } from "./plugins/execution.ts"
import * as llmDeepseek from "./plugins/llm-deepseek.ts"
import { LlmRuntime } from "./plugins/llm.ts"
import * as scheduleRunner from "./plugins/schedule-runner.ts"
import { ScheduleService } from "./plugins/schedule.ts"
import { SessionService } from "./plugins/session.ts"
import { SettingsService } from "./plugins/settings.ts"
import { PermissionService } from "./plugins/permissions.ts"
import { PlanModeService } from "./plugins/plan-mode.ts"
import { QuestionService } from "./plugins/questions.ts"
import * as skillBundled from "./plugins/skill-bundled.ts"
import * as skillWorkspace from "./plugins/skill-workspace.ts"
import { SkillService } from "./plugins/skills.ts"
import { SubagentService } from "./plugins/subagents.ts"
import * as toolAskUser from "./plugins/tool-ask-user.ts"
import * as toolSchedule from "./plugins/tool-schedule.ts"
import * as toolSkill from "./plugins/tool-skill.ts"
import * as toolSubagent from "./plugins/tool-subagent.ts"
import * as toolTodo from "./plugins/tool-todo.ts"
import { SystemPromptService } from "./plugins/system-prompt.ts"
import * as timeContext from "./plugins/time-context.ts"
import * as titles from "./plugins/titles.ts"
import * as toolLinux from "./plugins/tool-linux.ts"
import * as toolWeb from "./plugins/tool-web.ts"
import { ToolService } from "./plugins/tools.ts"
import * as webFetchHttp from "./plugins/web-fetch-http.ts"
import * as webSearchDeepseek from "./plugins/web-search-deepseek.ts"
import { WebRuntime } from "./plugins/web.ts"
import { resolveDeepseekModel } from "./lib/model.ts"
import type { SqlStorage } from "./sql.ts"
import type { Env } from "./types.ts"

export interface ComposeOptions {
  identityKey: string
  plugins?: Plugin[]
  armAlarm?: (at: number) => void
}

export async function composeHarness(
  env: Env,
  sql: SqlStorage,
  options: ComposeOptions,
): Promise<Context> {
  const ctx = new Context()
  const model = resolveDeepseekModel(env)
  const apiKey = env.DEEPSEEK_API_KEY
  const identityKey = options.identityKey

  await ctx.plugin(SettingsService, { sql })
  await ctx.plugin(SessionService, { sql })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(WebRuntime)
  await ctx.plugin(ToolService)
  await ctx.plugin(ExecutionService, { env, identityKey })
  await ctx.plugin(SystemPromptService)
  await ctx.plugin(CommandService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ScheduleService, { sql, armAlarm: options.armAlarm })
  await ctx.plugin(SkillService)
  await ctx.plugin(QuestionService, { env, identityKey })
  await ctx.plugin(PermissionService)
  await ctx.plugin(llmDeepseek, { apiKey, model, baseURL: llmDeepseek.DEFAULT_BASE_URL })
  await ctx.plugin(webSearchDeepseek, { apiKey, model })
  await ctx.plugin(webFetchHttp)
  await ctx.plugin(toolWeb)
  await ctx.plugin(toolLinux)
  await ctx.plugin(skillBundled)
  await ctx.plugin(skillWorkspace)
  await ctx.plugin(toolSkill)
  await ctx.plugin(toolTodo)
  await ctx.plugin(toolSchedule)
  await ctx.plugin(toolAskUser)
  await ctx.plugin(PlanModeService)
  await ctx.plugin(timeContext)
  await ctx.plugin(titles)
  await ctx.plugin(briefing)
  await ctx.plugin(CompactionService)
  await ctx.plugin(AgentLoop)
  await ctx.plugin(SubagentService)
  await ctx.plugin(toolSubagent)
  await ctx.plugin(scheduleRunner)
  for (const plugin of options.plugins ?? []) {
    await ctx.plugin(plugin)
  }
  return ctx
}
