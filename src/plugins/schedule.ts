import { Service, type Context } from "@deepseek-ai/cordis"
import { randomId } from "../lib/ids.ts"
import type { SqlStorage } from "../sql.ts"

export interface ScheduleConfig {
  sql: SqlStorage
  armAlarm?: (at: number) => void
}

export interface ScheduleRecord {
  id: string
  sessionId: string
  fireAt: number
  prompt: string
  everyMs?: number
}

export class ScheduleService extends Service {
  constructor(
    ctx: Context,
    private readonly config: ScheduleConfig,
  ) {
    super(ctx, "schedule")
    this.config.sql.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        fire_at INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        every_ms INTEGER,
        fired INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  create(input: { sessionId: string; fireAt: number; prompt: string; everyMs?: number }): ScheduleRecord {
    const record: ScheduleRecord = {
      id: randomId("sch"),
      sessionId: input.sessionId,
      fireAt: input.fireAt,
      prompt: input.prompt,
      everyMs: input.everyMs,
    }
    this.config.sql.exec(
      "INSERT INTO schedules (id, session_id, fire_at, prompt, every_ms, fired) VALUES (?, ?, ?, ?, ?, 0)",
      record.id,
      record.sessionId,
      record.fireAt,
      record.prompt,
      record.everyMs ?? null,
    )
    this.armNext()
    return record
  }

  list(sessionId: string): ScheduleRecord[] {
    const rows = this.config.sql.exec(
      "SELECT id, session_id, fire_at, prompt, every_ms FROM schedules WHERE session_id = ? AND fired = 0 ORDER BY fire_at ASC",
      sessionId,
    )
    const out: ScheduleRecord[] = []
    for (const row of rows) out.push(rowToSchedule(row))
    return out
  }

  delete(id: string): void {
    this.config.sql.exec("DELETE FROM schedules WHERE id = ?", id)
    this.armNext()
  }

  async fireDue(now = Date.now()): Promise<ScheduleRecord[]> {
    const rows = this.config.sql.exec(
      "SELECT id, session_id, fire_at, prompt, every_ms FROM schedules WHERE fired = 0 AND fire_at <= ? ORDER BY fire_at ASC",
      now,
    )
    const due: ScheduleRecord[] = []
    for (const row of rows) due.push(rowToSchedule(row))
    for (const item of due) {
      if (item.everyMs && item.everyMs >= 300_000) {
        const next = item.fireAt + item.everyMs
        this.config.sql.exec("UPDATE schedules SET fire_at = ? WHERE id = ?", next, item.id)
      } else {
        this.config.sql.exec("UPDATE schedules SET fired = 1 WHERE id = ?", item.id)
      }
      this.ctx.emit("schedule/due", item)
    }
    this.armNext()
    return due
  }

  private armNext(): void {
    const row = this.config.sql.exec(
      "SELECT MIN(fire_at) AS fire_at FROM schedules WHERE fired = 0",
    ).one()
    const at = Number(row?.fire_at ?? 0)
    if (at > 0) this.config.armAlarm?.(at)
  }
}

function rowToSchedule(row: Record<string, unknown>): ScheduleRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    fireAt: Number(row.fire_at),
    prompt: String(row.prompt),
    everyMs: row.every_ms == null ? undefined : Number(row.every_ms),
  }
}
