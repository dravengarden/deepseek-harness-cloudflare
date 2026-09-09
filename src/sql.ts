export interface SqlCursor {
  one(): Record<string, unknown> | null
  [Symbol.iterator](): IterableIterator<Record<string, unknown>>
}

export interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): SqlCursor
}
