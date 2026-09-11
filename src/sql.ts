export interface SqlCursor {
  one(): Record<string, unknown> | null
  [Symbol.iterator](): IterableIterator<Record<string, unknown>>
}

export interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): SqlCursor
}

/** Workers `.one()` throws on zero rows. Use this for optional lookups. */
export function firstRow(cursor: SqlCursor): Record<string, unknown> | null {
  for (const row of cursor) return row
  return null
}
