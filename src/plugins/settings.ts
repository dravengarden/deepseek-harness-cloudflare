import { Service, type Context } from "@deepseek-ai/cordis"
import { firstRow, type SqlStorage } from "../sql.ts"

export interface SettingsConfig {
  sql: SqlStorage
}

export class SettingsService extends Service {
  constructor(
    ctx: Context,
    private readonly config: SettingsConfig,
  ) {
    super(ctx, "settings")
    this.config.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        namespace TEXT PRIMARY KEY,
        document TEXT NOT NULL
      )
    `)
  }

  get<T extends Record<string, unknown>>(namespace: string, defaults: T): T {
    const row = firstRow(this.config.sql.exec("SELECT document FROM settings WHERE namespace = ?", namespace))
    if (!row) return { ...defaults }
    try {
      return { ...defaults, ...(JSON.parse(String(row.document)) as T) }
    } catch {
      return { ...defaults }
    }
  }

  set(namespace: string, document: Record<string, unknown>): void {
    this.config.sql.exec(
      "INSERT INTO settings (namespace, document) VALUES (?, ?) ON CONFLICT(namespace) DO UPDATE SET document = excluded.document",
      namespace,
      JSON.stringify(document),
    )
    this.ctx.emit("settings/change", namespace, document)
  }
}
