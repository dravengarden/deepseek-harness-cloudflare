import type { Context } from "@deepseek-ai/cordis"
import { isSkillName, parseSkillMd } from "../lib/skill-md.ts"
import type { SkillDefinition, SkillProvider } from "../types.ts"

const ROOTS = ["/workspace/.dsh/skills", "/workspace/.agents/skills"]

export const name = "skill-workspace"
export const inject = ["skills", "execution"]

export function apply(ctx: Context): void {
  const provider: SkillProvider = {
    name: "filesystem",
    async list() {
      if (!ctx.execution.activated) return []
      const out: SkillDefinition[] = []
      for (const root of ROOTS) {
        try {
          const listing = await ctx.execution.listDir(root, true)
          for (const file of listing.files) {
            if (file.type !== "file") continue
            const skill = await loadFile(ctx, file.path)
            if (skill) out.push(skill)
          }
        } catch {
          continue
        }
      }
      return out
    },
    async get(name) {
      const listed = await provider.list()
      return listed.find((skill) => skill.name === name)
    },
  }
  ctx.skills.registerProvider(provider)
}

async function loadFile(ctx: Context, path: string): Promise<SkillDefinition | undefined> {
  const base = path.split("/").pop() ?? ""
  const fromDir = /\/([^/]+)\/SKILL\.md$/i.exec(path)
  const fromFlat = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/i.exec(base)
  const fallback = fromDir?.[1] ?? fromFlat?.[1]
  if (!fallback || !isSkillName(fallback)) return
  try {
    const file = await ctx.execution.readFile(path)
    const parsed = parseSkillMd(file.content, fallback)
    const name = parsed.name ?? fallback
    const dir = fromDir ? path.slice(0, path.lastIndexOf("/")) : undefined
    return {
      name,
      description: parsed.description,
      content: parsed.body,
      invocation: { modelInvocable: parsed.modelInvocable, userInvocable: parsed.userInvocable },
      source: path.includes("/.dsh/") ? "project-dsh" : "project-agents",
      provider: "filesystem",
      resourceBase: dir ? { kind: "directory", path: dir } : undefined,
    }
  } catch {
    return undefined
  }
}
