const loginEl = document.querySelector("#login")
const appEl = document.querySelector("#app")
const errorEl = document.querySelector("#login-error")
const accessKeyEl = document.querySelector("#access-key")
const listEl = document.querySelector("#session-list")
const drawerEl = document.querySelector("#drawer")
const scrimEl = document.querySelector("#scrim")
const transcriptEl = document.querySelector("#transcript")
const emptyEl = document.querySelector("#empty")
const titleEl = document.querySelector("#title")
const liveEl = document.querySelector("#live")
const progressEl = document.querySelector("#progress")
const promptEl = document.querySelector("#prompt")
const permissionEl = document.querySelector("#permission")
const modelEl = document.querySelector("#model-label")
const slashEl = document.querySelector("#slash-menu")
const sendBtn = document.querySelector("#send-btn")
const openDrawerBtn = document.querySelector("#open-drawer")
const composerEl = document.querySelector("#composer")

const HISTORY_SKIP = new Set([
  "assistant/chunk",
  "assistant/thinking",
  "step/start",
  "step/end",
  "turn/start",
  "turn/end",
  "skill/catalog",
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let me = null
let sessions = []
let current = null
let sending = false
let commands = []
let slashIndex = 0
let pinBottom = true
let turnAbort = null

let pinRaf = 0

function shellEl() {
  if (appEl && !appEl.hidden) return appEl
  if (loginEl && !loginEl.hidden) return loginEl
  return null
}

function pinViewport() {
  const el = shellEl()
  const vv = window.visualViewport
  const focusing =
    document.activeElement === promptEl || document.activeElement === accessKeyEl
  if (!el) return
  if (focusing && vv) {
    el.style.height = `${Math.round(vv.height)}px`
    el.style.top = "0px"
    el.setAttribute("data-kb", "1")
  } else {
    el.style.height = ""
    el.style.top = ""
    el.removeAttribute("data-kb")
  }
  window.scrollTo(0, 0)
}

function pinDuringKeyboard() {
  const start = performance.now()
  const tick = (now) => {
    pinViewport()
    stick()
    if (now - start < 700) pinRaf = requestAnimationFrame(tick)
  }
  cancelAnimationFrame(pinRaf)
  pinRaf = requestAnimationFrame(tick)
}

function stick() {
  if (pinBottom) transcriptEl.scrollTop = transcriptEl.scrollHeight
}

function nearBottom() {
  return transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight < 96
}

function displayTitle(session) {
  const title = (session?.title || "").trim()
  if (!title || title === "Untitled" || title === session?.id || UUID.test(title)) return "New chat"
  return title
}

function syncEmpty() {
  emptyEl.hidden = transcriptEl.childElementCount > 0
}

function setBusy(on) {
  sending = on
  liveEl.hidden = !on
  progressEl.hidden = !on
  syncSend()
}

function syncSend() {
  if (sending) {
    sendBtn.disabled = false
    sendBtn.classList.add("stop")
    sendBtn.setAttribute("aria-label", "Stop")
    return
  }
  sendBtn.classList.remove("stop")
  sendBtn.setAttribute("aria-label", "Send")
  sendBtn.disabled = !promptEl.value.trim()
}

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

function openDrawer() {
  drawerEl.hidden = false
  scrimEl.hidden = false
  openDrawerBtn.setAttribute("aria-expanded", "true")
  document.querySelector("#close-drawer").focus()
}

function closeDrawer() {
  drawerEl.hidden = true
  scrimEl.hidden = true
  openDrawerBtn.setAttribute("aria-expanded", "false")
}

function growPrompt() {
  promptEl.style.height = "auto"
  const cap = Math.min(window.visualViewport?.height * 0.3 || 120, 160)
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, cap)}px`
}

function card(kind, text) {
  const el = document.createElement("div")
  el.className = `bubble ${kind}`
  if (text) el.textContent = text
  transcriptEl.append(el)
  syncEmpty()
  stick()
  return el
}

function lastStream(kind) {
  const node = transcriptEl.querySelector(`.bubble.${kind}:last-of-type`)
  return node?.dataset.stream === "1" ? node : null
}

function showThinking(on) {
  let chip = transcriptEl.querySelector(".thinking-chip")
  if (!on) {
    chip?.remove()
    return
  }
  if (!chip) {
    chip = document.createElement("div")
    chip.className = "thinking-chip"
    chip.innerHTML = "<i></i><i></i><i></i>"
    transcriptEl.append(chip)
    syncEmpty()
  }
  stick()
}

function renderSessions() {
  listEl.replaceChildren()
  if (sessions.length === 0) {
    const hint = document.createElement("p")
    hint.className = "empty-list"
    hint.textContent = "No chats yet"
    listEl.append(hint)
    return
  }
  for (const session of sessions) {
    const row = document.createElement("div")
    row.className = "session-row"
    const button = document.createElement("button")
    button.type = "button"
    button.className = `open${current?.id === session.id ? " active" : ""}`
    button.textContent = displayTitle(session)
    button.addEventListener("click", () => {
      closeDrawer()
      openSession(session.id)
    })
    const remove = document.createElement("button")
    remove.type = "button"
    remove.className = "delete"
    remove.setAttribute("aria-label", "Delete chat")
    remove.textContent = "×"
    remove.addEventListener("click", (event) => {
      event.stopPropagation()
      deleteSession(session.id)
    })
    row.append(button, remove)
    listEl.append(row)
  }
}

async function deleteSession(id) {
  if (!confirm("Delete this chat?")) return
  await api(`/api/sessions/${id}`, { method: "DELETE" })
  sessions = sessions.filter((session) => session.id !== id)
  if (current?.id === id) startNewChat()
  else renderSessions()
}

function renderEvent(event, live) {
  const payload = event.payload ?? {}
  if (!live && HISTORY_SKIP.has(event.type)) return
  if (!live && event.type === "ask/question") return
  if (event.type === "user/message") card("user", payload.content)
  else if (event.type === "assistant/thinking" && live) showThinking(true)
  else if (event.type === "assistant/chunk" && live) {
    showThinking(false)
    const existing = lastStream("assistant")
    if (existing) {
      existing.textContent += payload.text
      stick()
    } else {
      const el = card("assistant", payload.text)
      el.dataset.stream = "1"
    }
  } else if (event.type === "assistant/message") {
    showThinking(false)
    if (live && lastStream("assistant")) return
    if (payload.content) card("assistant", payload.content)
  } else if (event.type === "tool/call") {
    const el = card("tool")
    const name = document.createElement("strong")
    name.textContent = payload.name || "tool"
    el.append(name)
    const args = String(payload.arguments ?? "").trim()
    if (args) {
      const extra = document.createElement("span")
      extra.className = "tool-args"
      extra.textContent = ` ${args.slice(0, 160)}`
      el.append(extra)
    }
  } else if (event.type === "tool/result") {
    const el = card("tool")
    const name = document.createElement("strong")
    name.textContent = payload.name || "tool"
    el.append(name)
    const extra = document.createElement("span")
    extra.className = "tool-args"
    extra.textContent = ` ${String(payload.content ?? "").slice(0, 280)}`
    el.append(extra)
  } else if (event.type === "todo/write") {
    const todos = payload.todos ?? []
    card("todo", todos.map((item) => `[${item.status}] ${item.content}`).join("\n"))
  } else if (event.type === "ask/question" && live) renderAsk(payload)
  else if (event.type === "skill/inject") card("tool", payload.content)
  else if (event.type === "error") card("error", payload.message)
}

function renderAsk(payload) {
  const box = card("ask", payload.question)
  const input = document.createElement("input")
  input.placeholder = "Your answer"
  input.enterKeyHint = "send"
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
    input.disabled = true
  }
  button.addEventListener("click", () => send(input.value.trim()))
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      send(input.value.trim())
    }
  })
  box.append(input, button)
  for (const option of payload.options ?? []) {
    const choice = document.createElement("button")
    choice.type = "button"
    choice.className = "ghost"
    choice.textContent = option
    choice.addEventListener("click", () => send(option))
    box.append(choice)
  }
  input.focus()
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
      promptEl.focus({ preventScroll: true })
      growPrompt()
      syncSend()
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
  titleEl.textContent = displayTitle(current)
  transcriptEl.replaceChildren()
  pinBottom = true
  for (const event of body.events ?? []) renderEvent(event, false)
  syncEmpty()
  stick()
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
  titleEl.textContent = displayTitle(current)
  return current
}

async function consumeTurn(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
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
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

async function stopTurn() {
  turnAbort?.abort()
  if (current) {
    try {
      await api(`/api/sessions/${current.id}/cancel`, { method: "POST", body: "{}" })
    } catch {}
  }
}

async function showApp() {
  const [settings, commandBody] = await Promise.all([
    api("/api/settings").then((r) => r.json()),
    api("/api/commands").then((r) => r.json()),
  ])
  permissionEl.value = settings.permission || "workspace-write"
  modelEl.textContent = settings.model || "deepseek-flash"
  commands = commandBody.commands ?? []
  loginEl.hidden = true
  appEl.hidden = false
  pinViewport()
  await refreshSessions()
  if (sessions[0]) await openSession(sessions[0].id)
  else {
    current = null
    titleEl.textContent = "New chat"
    transcriptEl.replaceChildren()
    syncEmpty()
  }
}

async function login() {
  errorEl.hidden = true
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ accessKey: accessKeyEl.value.trim() }),
    })
    me = await api("/api/me").then((r) => r.json())
    await showApp()
  } catch (error) {
    errorEl.hidden = false
    errorEl.textContent = error.message
  }
}

function startNewChat() {
  closeDrawer()
  current = null
  transcriptEl.replaceChildren()
  titleEl.textContent = "New chat"
  pinBottom = true
  syncEmpty()
  renderSessions()
  promptEl.focus({ preventScroll: true })
}

transcriptEl.addEventListener("scroll", () => {
  pinBottom = nearBottom()
}, { passive: true })

document.querySelector("#login-btn").addEventListener("click", login)
accessKeyEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault()
    login()
  }
})

document.querySelector("#logout-btn").addEventListener("click", async () => {
  const body = await api("/api/logout", { method: "POST", body: "{}" }).then((r) => r.json())
  if (body.logout) location.href = body.logout
  else location.reload()
})

openDrawerBtn.addEventListener("click", openDrawer)
document.querySelector("#close-drawer").addEventListener("click", closeDrawer)
scrimEl.addEventListener("click", closeDrawer)
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !drawerEl.hidden) closeDrawer()
})

document.querySelector("#new-chat").addEventListener("click", startNewChat)
document.querySelector("#drawer-new").addEventListener("click", startNewChat)

document.querySelector("#fork-btn").addEventListener("click", async () => {
  if (!current) return
  const body = await api(`/api/sessions/${current.id}/fork`, { method: "POST", body: "{}" }).then((r) => r.json())
  sessions.unshift(body.session)
  closeDrawer()
  await openSession(body.session.id)
})

document.querySelector("#compact-btn").addEventListener("click", async () => {
  if (!current) return
  const body = await api(`/api/sessions/${current.id}/command`, {
    method: "POST",
    body: JSON.stringify({ command: "/compact" }),
  }).then((r) => r.json())
  closeDrawer()
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
  growPrompt()
  syncSend()
})

promptEl.addEventListener("focus", () => {
  pinDuringKeyboard()
})
promptEl.addEventListener("blur", () => {
  pinDuringKeyboard()
})

promptEl.addEventListener("keydown", (event) => {
  if (event.isComposing) return
  if (!slashEl.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault()
    slashIndex += event.key === "ArrowDown" ? 1 : -1
    renderSlash()
    return
  }
  if (event.key !== "Enter" || event.shiftKey) return
  if (!slashEl.hidden) {
    const active = slashEl.querySelector("button.active")
    if (active) {
      event.preventDefault()
      active.click()
    }
    return
  }
  if (sending) return
  event.preventDefault()
  composerEl.requestSubmit()
})

composerEl.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (sending) {
    await stopTurn()
    return
  }
  const message = promptEl.value.trim()
  if (!message) return
  slashEl.hidden = true
  setBusy(true)
  turnAbort = new AbortController()
  try {
    const session = await ensureSession()
    if (displayTitle(session) === "New chat") titleEl.textContent = message.slice(0, 40)
    promptEl.value = ""
    growPrompt()
    syncSend()
    promptEl.focus({ preventScroll: true })
    if (navigator.vibrate) navigator.vibrate(10)
    const response = await api(`/api/sessions/${session.id}/turn`, {
      method: "POST",
      body: JSON.stringify({ message }),
      signal: turnAbort.signal,
    })
    if (response.headers.get("content-type")?.includes("event-stream")) {
      await consumeTurn(response)
    } else {
      const body = await response.json()
      card("tool", body.result || JSON.stringify(body))
    }
    await refreshSessions()
    if (current) titleEl.textContent = displayTitle(sessions.find((item) => item.id === current.id) || current)
  } catch (error) {
    if (error.name !== "AbortError") card("error", error.message)
  } finally {
    showThinking(false)
    turnAbort = null
    setBusy(false)
    pinBottom = true
    stick()
  }
})

let swipeX = 0
let swipeY = 0
let swiping = false
document.addEventListener("touchstart", (event) => {
  const touch = event.touches[0]
  if (!touch) return
  swipeX = touch.clientX
  swipeY = touch.clientY
  swiping = drawerEl.hidden ? swipeX < 28 : true
}, { passive: true })
document.addEventListener("touchmove", (event) => {
  if (!swiping) return
  const touch = event.touches[0]
  if (!touch) return
  const dx = touch.clientX - swipeX
  const dy = touch.clientY - swipeY
  if (Math.abs(dy) > Math.abs(dx) + 8) {
    swiping = false
    return
  }
  if (drawerEl.hidden && dx > 56) {
    swiping = false
    openDrawer()
  } else if (!drawerEl.hidden && dx < -56) {
    swiping = false
    closeDrawer()
  }
}, { passive: true })

const vv = window.visualViewport
pinViewport()
vv?.addEventListener("resize", () => {
  pinViewport()
  stick()
})
vv?.addEventListener("scroll", () => {
  pinViewport()
  window.scrollTo(0, 0)
})
window.addEventListener("resize", pinViewport)
window.addEventListener("orientationchange", () => setTimeout(pinDuringKeyboard, 250))
window.addEventListener("pageshow", pinViewport)
document.addEventListener("scroll", () => {
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
}, { passive: true })

api("/api/me")
  .then((r) => r.json())
  .then(async (body) => {
    me = body
    await showApp()
  })
  .catch(() => {
    loginEl.hidden = false
    pinViewport()
  })
