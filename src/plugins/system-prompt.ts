import { Service, type Context } from "@deepseek-ai/cordis"
import type { PromptSection } from "../types.ts"

export class SystemPromptService extends Service {
  private readonly sections = new Map<string, PromptSection>()

  constructor(ctx: Context) {
    super(ctx, "systemPrompt")
  }

  section(section: PromptSection): () => void {
    this.sections.set(section.name, section)
    return this.ctx.effect(() => () => {
      this.sections.delete(section.name)
    })
  }

  assemble(): string {
    return [...this.sections.values()]
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
      .map((section) => section.text()?.trim())
      .filter((text): text is string => Boolean(text))
      .join("\n\n")
  }
}
