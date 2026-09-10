import type { ControlMailbox } from "./mailbox.ts"
import type { Sandbox } from "./sandbox.ts"

export interface Env {
  HARNESS: DurableObjectNamespace
  Sandbox: DurableObjectNamespace<Sandbox>
  MAILBOX: DurableObjectNamespace<ControlMailbox>
  ASSETS: Fetcher
  BACKUP_BUCKET: R2Bucket
  DEEPSEEK_API_KEY: string
  DSH_CF_ACCESS_KEY: string
  DEEPSEEK_MODEL?: string
  LOCAL_DEV?: string
  BACKUP_BUCKET_NAME?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  TEAM_DOMAIN?: string
  POLICY_AUD?: string
  IDENTITY_MODE?: "per-user" | "shared-owner"
  LEGACY_OWNER_EMAIL?: string
  LEGACY_OWNER_SUB?: string
}

export type Role = "system" | "user" | "assistant" | "tool"

export interface ChatMessage {
  role: Role
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>
}

export interface SessionEventMap {
  "turn/start": Record<string, never>
  "turn/end": { reason?: string }
  "step/start": { step: number }
  "step/end": { step: number }
  "user/message": { content: string }
  "assistant/chunk": { text: string }
  "assistant/thinking": { text: string }
  "assistant/message": { content: string | null; tool_calls?: ToolCall[] }
  "tool/call": { id: string; name: string; arguments: string }
  "tool/result": { id: string; name: string; content: string }
  "compaction/summary": { content: string; throughSeq: number }
  "skill/catalog": { content: string; digest: string }
  "skill/inject": { name: string; content: string }
  "todo/write": { todos: TodoItem[] }
  "plan/mode": { active: boolean }
  "ask/question": { id: string; question: string; options?: string[] }
  "ask/answer": { id: string; answer: string }
}

export interface SessionEvent<K extends string = string> {
  type: K
  payload: K extends keyof SessionEventMap ? SessionEventMap[K] : unknown
  seq: number
  createdAt: number
}

export interface SessionRecord {
  id: string
  title: string
  createdAt: number
  parentId?: string
}

export interface WebSource {
  title: string
  url: string
  snippet?: string
}

export interface WebSearchResult {
  query: string
  answer?: string
  sources: WebSource[]
  truncated?: boolean
}

export interface LlmRequest {
  messages: ChatMessage[]
  tools: Array<{
    type: "function"
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }>
  signal?: AbortSignal
}

export interface LlmDelta {
  kind: "thinking" | "text" | "tool_call"
  text?: string
  toolCall?: ToolCall
}

export interface TurnEvent {
  type: string
  payload: unknown
}

export interface PromptSection {
  name: string
  order: number
  text: () => string | undefined
}

export interface CommandDefinition {
  name: string
  description: string
  run(args: string, sessionId: string): Promise<string>
}

export interface SkillInvocationPolicy {
  modelInvocable: boolean
  userInvocable: boolean
}

export type SkillSource = "project-dsh" | "project-agents" | "runtime" | "bundled" | (string & {})

export type SkillResourceBase =
  | { kind: "directory"; path: string }
  | { kind: "url"; url: string }
  | { kind: "opaque"; description: string }

export interface SkillSummary {
  name: string
  description: string
  invocation: SkillInvocationPolicy
  source: SkillSource
  provider: string
  resourceBase?: SkillResourceBase
}

export interface SkillDefinition extends SkillSummary {
  content: string
}

export interface SkillProvider {
  name: string
  list(): Promise<SkillDefinition[]>
  get(name: string): Promise<SkillDefinition | undefined>
}

export interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
}
