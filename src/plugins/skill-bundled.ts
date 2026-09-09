import type { Context } from "@deepseek-ai/cordis"
import type { SkillDefinition } from "../types.ts"

const BUNDLED: SkillDefinition[] = [
  {
    name: "research-briefing",
    description: "Search, fetch, and write a cited Markdown briefing for a research question.",
    content: `You are producing a research briefing, not a coding task.

1. Call web_search with 1–4 focused queries.
2. web_fetch the 2–5 most important URLs.
3. Write Markdown with: Question, Findings, Open questions, Sources (title + URL).
Cite inline. If search or fetch fails, say so. Prefer primary documents.`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: "bundled",
    provider: "bundled",
  },
  {
    name: "linux-workspace",
    description: "Use the Cloudflare Sandbox /workspace for scripts, files, and calculation.",
    content: `Linux tools run in /workspace of the Sandbox container.

- Prefer bash, read_file, write_file, list_dir for local work.
- Paths must stay under /workspace.
- The container sleeps after 10 minutes idle; /workspace is restored from the last backup.
- Do not use the shell instead of web_search for public facts.`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: "bundled",
    provider: "bundled",
  },
]

export const name = "skill-bundled"
export const inject = ["skills"]

export function apply(ctx: Context): void {
  for (const skill of BUNDLED) ctx.skills.register(skill)
}
