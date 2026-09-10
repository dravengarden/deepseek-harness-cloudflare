export const SANDBOX_CAPACITY_MESSAGE =
  "sandbox capacity reached (max_instances); retry when another workspace sleeps"

export function isSandboxCapacityError(error: unknown): boolean {
  let current: unknown = error
  for (let i = 0; i < 5 && current; i += 1) {
    const text = current instanceof Error ? `${current.name} ${current.message}` : String(current)
    const lower = text.toLowerCase()
    if (
      /max[_\s-]?instances/.test(lower) ||
      lower.includes("maximum number of instance") ||
      lower.includes("no available instance") ||
      lower.includes("instance limit") ||
      lower.includes("capacity") ||
      lower.includes("provision")
    ) {
      return true
    }
    current = current instanceof Error ? current.cause : undefined
  }
  return false
}
