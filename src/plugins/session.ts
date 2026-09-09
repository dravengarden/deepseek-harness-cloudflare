import { Service, type Context } from "@deepseek-ai/cordis"
import { deriveMessages } from "../lib/derive-messages.ts"
import { randomId } from "../lib/ids.ts"
import type { SqlStorage } from "../sql.ts"
import type { SessionEvent, SessionRecord } from "../types.ts"

export { deriveMessages }

export interface SessionConfig {
  sql: SqlStorage
}

export class Session {
  private readonly store: SessionService
  readonly record: SessionRecord

  constructor(store: SessionService, record: SessionRecord) {
    this.store = store
    this.record = record
  }

  get id(): string {
    return this.record.id
  }

  get title(): string {
    return this.record.title
  }

  append(type: string, payload: unknown): SessionEvent {
    return this.store.append(this.id, type, payload)
  }

  events(): SessionEvent[] {
    return this.store.events(this.id)
  }

  deriveMessages() {
    return deriveMessages(this.events())
  }

  rename(title: string): void {
    this.store.rename(this.id, title)
    this.record.title = title.slice(0, 80)
  }
}

export class SessionService extends Service {
  constructor(
    ctx: Context,
    private readonly config: SessionConfig,
  ) {
    super(ctx, "sessions")
    this.config.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        parent_id TEXT
      )
    `)
    this.config.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, seq)
      )
    `)
  }

  create(title = "Untitled", parentId?: string): Session {
    const record: SessionRecord = {
      id: randomId("ses"),
      title,
      createdAt: Date.now(),
      parentId,
    }
    this.config.sql.exec(
      "INSERT INTO sessions (id, title, created_at, parent_id) VALUES (?, ?, ?, ?)",
      record.id,
      record.title,
      record.createdAt,
      parentId ?? null,
    )
    return new Session(this, record)
  }

  list(): SessionRecord[] {
    const rows = this.config.sql.exec(
      "SELECT id, title, created_at, parent_id FROM sessions ORDER BY created_at DESC LIMIT 50",
    )
    const out: SessionRecord[] = []
    for (const row of rows) out.push(rowToRecord(row))
    return out
  }

  get(id: string): Session | null {
    const row = this.config.sql.exec(
      "SELECT id, title, created_at, parent_id FROM sessions WHERE id = ?",
      id,
    ).one()
    if (!row) return null
    return new Session(this, rowToRecord(row))
  }

  rename(id: string, title: string): void {
    this.config.sql.exec("UPDATE sessions SET title = ? WHERE id = ?", title.slice(0, 80), id)
  }

  fork(sourceId: string, boundary?: number): Session {
    const source = this.get(sourceId)
    if (!source) throw new Error("session not found")
    const events = source.events()
    const last = events.at(-1)
    const end = boundary ?? last?.seq ?? 0
    if (events.some((event) => event.seq <= end && event.type === "turn/start")
      && !events.some((event) => event.seq <= end && event.type === "turn/end")) {
      throw new Error("cannot fork during an open turn")
    }
    const child = this.create(source.title, source.id)
    for (const event of events.filter((item) => item.seq <= end)) {
      this.config.sql.exec(
        "INSERT INTO events (session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        child.id,
        event.seq,
        event.type,
        JSON.stringify(event.payload),
        event.createdAt,
      )
    }
    return child
  }

  append(sessionId: string, type: string, payload: unknown): SessionEvent {
    const last = this.config.sql.exec(
      "SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE session_id = ?",
      sessionId,
    ).one()
    const seq = Number(last?.seq ?? 0) + 1
    const event: SessionEvent = { type, payload, seq, createdAt: Date.now() }
    this.config.sql.exec(
      "INSERT INTO events (session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
      sessionId,
      event.seq,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    )
    this.ctx.emit("session/event", sessionId, event)
    return event
  }

  events(sessionId: string): SessionEvent[] {
    const rows = this.config.sql.exec(
      "SELECT seq, type, payload, created_at FROM events WHERE session_id = ? ORDER BY seq ASC",
      sessionId,
    )
    const out: SessionEvent[] = []
    for (const row of rows) {
      out.push({
        seq: Number(row.seq),
        type: String(row.type),
        payload: JSON.parse(String(row.payload)),
        createdAt: Number(row.created_at),
      })
    }
    return out
  }
}

function rowToRecord(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: Number(row.created_at),
    parentId: row.parent_id == null ? undefined : String(row.parent_id),
  }
}
