export function randomId(prefix = ""): string {
  const id = crypto.randomUUID()
  return prefix ? `${prefix}_${id}` : id
}
