/** Structured JSON lines for `wrangler tail`. Never put JWTs, access keys, or API keys in `fields`. */

export type LogLevel = "info" | "error"

export interface LogFields {
  level?: LogLevel
  msg: string
  identityKey?: string
  sessionId?: string
  route?: string
  doClass?: string
  elapsedMs?: number
  err?: unknown
  [key: string]: unknown
}

const REDACT_KEY =
  /jwt|assertion|access[_-]?key|api[_-]?key|authorization|cookie|secret|deepseek_api_key|dsh_cf_access_key/i
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const LOG_LIMIT = 256

export function truncateForLog(value: string, limit = LOG_LIMIT): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

export function log(fields: LogFields): void {
  const level: LogLevel = fields.level === "error" ? "error" : "info"
  const payload: Record<string, unknown> = { level, msg: scrub(String(fields.msg)) }
  for (const [key, value] of Object.entries(fields)) {
    if (key === "level" || key === "msg" || value === undefined) continue
    const serialized = serialize(key, value)
    if (serialized !== undefined) payload[key] = serialized
  }
  const line = JSON.stringify(payload)
  if (level === "error") console.error(line)
  else console.log(line)
}

function serialize(key: string, value: unknown): unknown {
  if (REDACT_KEY.test(key)) return "[redacted]"
  if (key === "err") return truncateForLog(scrub(errorText(value)))
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "boolean") return value
  if (typeof value === "string") return truncateForLog(scrub(value))
  return undefined
}

function errorText(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  return String(value)
}

function scrub(value: string): string {
  return value.replace(JWT_RE, "[redacted]")
}
