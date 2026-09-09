const loginEl = document.querySelector("#login")
const appEl = document.querySelector("#app")
const errorEl = document.querySelector("#login-error")
const listEl = document.querySelector("#session-list")
const transcriptEl = document.querySelector("#transcript")
const titleEl = document.querySelector("#session-title")
const metaEl = document.querySelector("#session-meta")
const promptEl = document.querySelector("#prompt")
const hintEl = document.querySelector("#composer-hint")
const emailEl = document.querySelector("#user-email")
const permissionEl = document.querySelector("#permission")
const slashEl = document.querySelector("#slash-menu")

const HISTORY_SKIP = new Set([
  "assistant/chunk",
  "assistant/thinking",
  "step/start",
  "step/end",
  "turn/start",
  "turn/end",
  "skill/catalog",
])

let me = null
let sessions = []
let current = null
let sending = false
let commands = []
let slashIndex = 0

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  })
  if (!response.ok && !response.headers.get("content-type")?.includes("event-stream")) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  return response
}

function card(kind, text) {
  const el = document.createElement("div")
  el.className = `card ${kind}`
  if (text) el.textContent = text
  transcriptEl.append(el)
  el.scrollIntoView({ block: "end" })
  return el
}

function renderSessions() {
  listEl.replaceChildren()
  for (const session of sessions) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = session.title || "Untitled"
    button.className = current?.id === session.id ? "active" : ""
    button.addEventListener("click", () => openSession(session.id))
    listEl.append(button)
  }
}

function lastStream(kind) {
  const node = transcriptEl.querySelector(`.card.${kind}:last-of-type`)
  return node?.dataset.stream === "1" ? node : null
}

function renderEvent(event, live) {
  const payload = event.payload ?? {}
  if (!live && HISTORY_SKIP.has(event.type)) return
  if (!live && event.type === "ask/question") return
  if (event.type === "user/message") card("user", payload.content)
  else if (event.type === "assistant/thinking" && live) {
    const existing = lastStream("thinking")
    if (existing) existing.textContent += payload.text
    else {
      const el = card("thinking", payload.text)
      el.dataset.stream = "1"
    }
  } else if (event.type === "assistant/chunk" && live) {
    const existing = lastStream("assistant")
    if (existing) existing.textContent += payload.text
    else {
      const el = card("assistant", payload.text)
      el.dataset.stream = "1"
    }
  } else if (event.type === "assistant/message") {
    if (live && lastStream("assistant")) return
    if (payload.content) card("assistant", payload.content)
  } else if (event.type === "tool/call") {
    card("tool", `${payload.name} ${payload.arguments ?? ""}`.slice(0, 800))
  } else if (event.type === "tool/result") {
    card("tool", `${payload.name} → ${String(payload.content ?? "").slice(0, 600)}`)
  } else if (event.type === "todo/write") {
    const todos = payload.todos ?? []
    card("todo", todos.map((item) => `[${item.status}] ${item.content}`).join("\n"))
  } else if (event.type === "ask/question" && live) renderAsk(payload)
  else if (event.type === "skill/inject") card("tool", payload.content)
  else if (event.type === "error") card("error", payload.message)
}

function renderAsk(payload) {
  const box = card("ask", payload.question)
  const row = document.createElement("div")
  row.className = "row"
  const input = document.createElement("input")
  input.placeholder = "Your answer"
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Answer"
  const send = async (answer) => {
    if (!current || !answer) return
    await api(`/api/sessions/${current.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ id: payload.id, answer }),
    })
    button.disabled = true
  }
  button.addEventListener("click", () => send(input.value.trim()))
  row.append(input, button)
  box.append(row)
  for (const option of payload.options ?? []) {
    const choice = document.createElement("button")
    choice.type = "button"
    choice.className = "ghost"
    choice.textContent = option
    choice.addEventListener("click", () => send(option))
    box.append(choice)
  }
}

function matchedCommands() {
  const value = promptEl.value
  if (!value.startsWith("/") || value.includes("\n")) return []
  const q = value.slice(1).toLowerCase()
  return commands.filter((command) => command.name.startsWith(q) || `/${command.name}`.startsWith(value.toLowerCase()))
}

function renderSlash() {
  const hits = matchedCommands()
  if (hits.length === 0) {
    slashEl.hidden = true
    return
  }
  slashIndex = Math.max(0, Math.min(slashIndex, hits.length - 1))
  slashEl.hidden = false
  slashEl.replaceChildren()
  hits.forEach((command, index) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = index === slashIndex ? "active" : ""
    const code = document.createElement("code")
    code.textContent = `/${command.name}`
    const desc = document.createElement("span")
    desc.className = "desc"
    desc.textContent = ` ${command.description}`
    button.append(code, desc)
    button.addEventListener("click", () => {
      promptEl.value = `/${command.name} `
      slashEl.hidden = true
      promptEl.focus()
    })
    slashEl.append(button)
  })
}

async function refreshSessions() {
  const body = await api("/api/sessions").then((r) => r.json())
  sessions = body.sessions ?? []
  renderSessions()
}

async function openSession(id) {
  const body = await api(`/api/sessions/${id}`).then((r) => r.json())
  current = body.session
  titleEl.textContent = current.title || "Untitled"
  metaEl.textContent = current.id
  transcriptEl.replaceChildren()
  for (const event of body.events ?? []) renderEvent(event, false)
  renderSessions()
}

async function ensureSession() {
  if (current) return current
  const body = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title: "Untitled" }),
  }).then((r) => r.json())
  current = body.session
  sessions.unshift(current)
  renderSessions()
  titleEl.textContent = current.title
  metaEl.textContent = current.id
  return current
}

async function consumeTurn(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((part) => part.startsWith("data:"))
      if (!line) continue
      renderEvent(JSON.parse(line.slice(5).trim()), true)
    }
  }
}

async function showApp() {
  const [settings, commandBody] = await Promise.all([
    api("/api/settings").then((r) => r.json()),
    api("/api/commands").then((r) => r.json()),
  ])
  permissionEl.value = settings.permission || "workspace-write"
  hintEl.textContent = settings.model || ""
  emailEl.textContent = me.email
  commands = commandBody.commands ?? []
  loginEl.hidden = true
  appEl.hidden = false
  await refreshSessions()
  if (sessions[0]) await openSession(sessions[0].id)
}

document.querySelector("#login-btn").addEventListener("click", async () => {
  errorEl.hidden = true
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ accessKey: document.querySelector("#access-key").value }),
    })
    me = await api("/api/me").then((r) => r.json())
    await showApp()
  } catch (error) {
    errorEl.hidden = false
    errorEl.textContent = error.message
  }
})

document.querySelector("#logout-btn").addEventListener("click", async () => {
  const body = await api("/api/logout", { method: "POST", body: "{}" }).then((r) => r.json())
  if (body.logout) location.href = body.logout
  else location.reload()
})

document.querySelector("#new-session").addEventListener("click", async () => {
  current = null
  transcriptEl.replaceChildren()
  titleEl.textContent = "New session"
  metaEl.textContent = ""
  await ensureSession()
})

document.querySelector("#fork-btn").addEventListener("click", async () => {
  if (!current) return
  const body = await api(`/api/sessions/${current.id}/fork`, { method: "POST", body: "{}" }).then((r) => r.json())
  sessions.unshift(body.session)
  await openSession(body.session.id)
})

document.querySelector("#cancel-btn").addEventListener("click", async () => {
  if (!current) return
  await api(`/api/sessions/${current.id}/cancel`, { method: "POST", body: "{}" })
})

document.querySelector("#compact-btn").addEventListener("click", async () => {
  if (!current) return
  const body = await api(`/api/sessions/${current.id}/command`, {
    method: "POST",
    body: JSON.stringify({ command: "/compact" }),
  }).then((r) => r.json())
  card("tool", body.result || "compacted")
})

permissionEl.addEventListener("change", async () => {
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ permission: permissionEl.value }),
  })
})

promptEl.addEventListener("input", () => {
  slashIndex = 0
  renderSlash()
})

promptEl.addEventListener("keydown", (event) => {
  if (slashEl.hidden) return
  const hits = matchedCommands()
  if (event.key === "ArrowDown") {
    event.preventDefault()
    slashIndex = (slashIndex + 1) % hits.length
    renderSlash()
  } else if (event.key === "ArrowUp") {
    event.preventDefault()
    slashIndex = (slashIndex - 1 + hits.length) % hits.length
    renderSlash()
  } else if (event.key === "Tab" && hits[slashIndex]) {
    event.preventDefault()
    promptEl.value = `/${hits[slashIndex].name} `
    slashEl.hidden = true
  } else if (event.key === "Escape") {
    slashEl.hidden = true
  }
})

document.querySelector("#composer").addEventListener("submit", async (event) => {
  event.preventDefault()
  if (sending) return
  const message = promptEl.value.trim()
  if (!message) return
  sending = true
  slashEl.hidden = true
  try {
    const session = await ensureSession()
    if (session.title === "Untitled") titleEl.textContent = message.slice(0, 72)
    promptEl.value = ""
    const response = await api(`/api/sessions/${session.id}/turn`, {
      method: "POST",
      body: JSON.stringify({ message }),
    })
    if (response.headers.get("content-type")?.includes("event-stream")) {
      await consumeTurn(response)
    } else {
      const body = await response.json()
      card("tool", body.result || JSON.stringify(body))
    }
    await refreshSessions()
  } catch (error) {
    card("error", error.message)
  } finally {
    sending = false
  }
})

api("/api/me")
  .then((r) => r.json())
  .then(async (body) => {
    me = body
    await showApp()
  })
  .catch(() => {
    loginEl.hidden = false
  })
