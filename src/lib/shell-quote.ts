/** POSIX single-quote so glob/grep patterns cannot break out of `sandbox.exec`. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
