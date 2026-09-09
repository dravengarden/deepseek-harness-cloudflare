const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
])

const PRIVATE_V4 =
  /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

export class FetchPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FetchPolicyError"
  }
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchPolicyError("invalid url")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPolicyError("only http(s) urls are allowed")
  }
  if (url.username || url.password) {
    throw new FetchPolicyError("urls must not contain credentials")
  }
  if (raw.length > 2048) {
    throw new FetchPolicyError("url too long")
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchPolicyError("host is not public")
  }
  if (host === "::1" || host === "[::1]") {
    throw new FetchPolicyError("host is not public")
  }
  if (PRIVATE_V4.test(host) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new FetchPolicyError("ip literals are not allowed")
  }
  return url
}
