const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isSkillName(name: string): boolean {
  return NAME_RE.test(name)
}

export interface ParsedSkillMd {
  name?: string
  description: string
  body: string
  modelInvocable: boolean
  userInvocable: boolean
}

export function parseSkillMd(raw: string, fallbackName: string): ParsedSkillMd {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return {
      description: fallbackName,
      body: raw.trim(),
      modelInvocable: true,
      userInvocable: true,
    }
  }
  const fm: Record<string, string> = {}
  for (const line of match[1]!.split("\n")) {
    const cut = line.indexOf(":")
    if (cut <= 0) continue
    fm[line.slice(0, cut).trim()] = line.slice(cut + 1).trim().replace(/^["']|["']$/g, "")
  }
  const name = fm.name
  return {
    name: name && isSkillName(name) ? name : undefined,
    description: fm.description || fallbackName,
    body: match[2]!.trim(),
    modelInvocable: fm["disable-model-invocation"] !== "true",
    userInvocable: fm["user-invocable"] !== "false",
  }
}

export function renderSkillContent(name: string, body: string, resource?: string): string {
  const guidance = resource
    ?? "Resources for this skill are managed by the host. Load referenced resources only as needed."
  return `<skill_content name="${escapeXml(name)}">
<skill_resources>
${guidance}
</skill_resources>

<skill_instructions>
${body}
</skill_instructions>
</skill_content>`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
