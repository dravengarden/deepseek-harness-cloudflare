import type { Context } from "@deepseek-ai/cordis"
import type { TodoItem } from "../types.ts"

export const name = "tool-todo"
export const inject = ["tools", "sessions", "systemPrompt"]

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "todos",
    order: 45,
    text: () => {
      const sessionId = ctx.tools.sessionId
      if (!sessionId) return
      const todos = latestTodos(ctx, sessionId)
      if (!todos) return
      return `Current todo list:\n${todos.map((item) => `- [${item.status}] ${item.content}`).join("\n")}`
    },
  })

  ctx.tools.register({
    name: "todo_write",
    description:
      "Replace this session's task list. Send the ENTIRE list every call. Status is pending, in_progress, or completed. Several tasks may be in_progress (subagents / parallel work).",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["content", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["todos"],
    },
    async execute(args) {
      const sessionId = ctx.tools.sessionId
      if (!sessionId) return "Error: todo_write requires an owning agent session"
      const session = ctx.sessions.get(sessionId)
      if (!session) return "Error: todo_write requires an owning agent session"
      const raw = Array.isArray(args.todos) ? args.todos : []
      const todos: TodoItem[] = []
      const seen = new Set<string>()
      for (const item of raw) {
        const row = item as Record<string, unknown>
        const content = String(row.content ?? "").trim()
        const status = String(row.status ?? "")
        if (!content) return "Error: invalid todo: `content` must be a non-empty string"
        if (seen.has(content)) return `Error: invalid todos: duplicate content "${content}"`
        if (status !== "pending" && status !== "in_progress" && status !== "completed") {
          return "Error: invalid todo status"
        }
        seen.add(content)
        todos.push({ content, status })
      }
      session.append("todo/write", { todos })
      const pending = todos.filter((item) => item.status === "pending").length
      const inProgress = todos.filter((item) => item.status === "in_progress").length
      const completed = todos.filter((item) => item.status === "completed").length
      return `Updated todo list: ${pending} pending, ${inProgress} in progress, ${completed} completed.`
    },
  })
}

function latestTodos(ctx: Context, sessionId: string): TodoItem[] | undefined {
  const session = ctx.sessions.get(sessionId)
  if (!session) return
  const event = [...session.events()].reverse().find((item) => item.type === "todo/write")
  if (!event) return
  const todos = (event.payload as { todos?: TodoItem[] }).todos
  return Array.isArray(todos) ? todos : undefined
}
