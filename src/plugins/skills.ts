import { Service, type Context } from "@deepseek-ai/cordis"
import { isSkillName, renderSkillContent } from "../lib/skill-md.ts"
import type { SkillDefinition, SkillProvider, SkillSummary } from "../types.ts"

const CATALOG_DESC_MAX = 500

export class SkillService extends Service {
  private readonly runtime = new Map<string, SkillDefinition>()
  private readonly providers = new Map<string, SkillProvider>()

  constructor(ctx: Context) {
    super(ctx, "skills")
  }

  register(skill: SkillDefinition): () => void {
    if (!isSkillName(skill.name)) throw new Error(`invalid skill name "${skill.name}"`)
    const complete: SkillDefinition = {
      ...skill,
      invocation: skill.invocation ?? { modelInvocable: true, userInvocable: true },
      source: skill.source ?? "runtime",
      provider: skill.provider ?? "runtime",
    }
    this.runtime.set(complete.name, complete)
    return this.ctx.effect(() => () => {
      this.runtime.delete(complete.name)
    })
  }

  registerProvider(provider: SkillProvider): () => void {
    this.providers.set(provider.name, provider)
    return this.ctx.effect(() => () => {
      this.providers.delete(provider.name)
    })
  }

  async snapshot(): Promise<SkillSummary[]> {
    const byName = new Map<string, SkillSummary>()
    for (const skill of this.runtime.values()) byName.set(skill.name, skill)
    for (const provider of this.providers.values()) {
      try {
        const listed = await provider.list()
        for (const skill of listed) {
          if (!byName.has(skill.name)) byName.set(skill.name, skill)
        }
      } catch {
        // Incomplete provider; keep runtime + other providers.
      }
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
  }

  list(): SkillSummary[] {
    return [...this.runtime.values()].sort((left, right) => left.name.localeCompare(right.name))
  }

  async get(name: string): Promise<SkillDefinition | undefined> {
    const runtime = this.runtime.get(name)
    if (runtime) return runtime
    for (const provider of this.providers.values()) {
      try {
        const skill = await provider.get(name)
        if (skill) return skill
      } catch {
        continue
      }
    }
    return undefined
  }

  digest(skills: SkillSummary[]): string {
    return skills
      .filter((skill) => skill.invocation.modelInvocable)
      .map((skill) => `${skill.name}:${skill.description.slice(0, CATALOG_DESC_MAX)}`)
      .join("|")
  }

  renderCatalog(skills: SkillSummary[]): string {
    const rows = skills
      .filter((skill) => skill.invocation.modelInvocable)
      .map((skill) => `- \`${skill.name}\`: ${skill.description.slice(0, CATALOG_DESC_MAX)}`)
    return `<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
${rows.join("\n") || "(none)"}
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the \`skill\` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the \`skill\` tool again for that skill.
</system-reminder>`
  }

  renderBody(skill: SkillDefinition): string {
    const resource = skill.resourceBase
      ? skill.resourceBase.kind === "directory"
        ? `Base directory for this skill: ${skill.resourceBase.path}\nResolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.`
        : skill.resourceBase.kind === "url"
          ? `Base URL for this skill: ${skill.resourceBase.url}\nResolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.`
          : `Resources for this skill: ${skill.resourceBase.description}\nLoad referenced resources only as needed.`
      : undefined
    return renderSkillContent(skill.name, skill.content, resource)
  }
}
