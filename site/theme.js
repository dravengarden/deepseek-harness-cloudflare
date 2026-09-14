(() => {
  const KEY = "dsh-docs-theme"
  const root = document.documentElement
  const boxes = [...document.querySelectorAll("[data-menu-box]")]
  const themeLabel = document.querySelector("[data-theme-label]")
  const labels = { auto: "Auto", light: "Light", dark: "Dark" }

  function preferred() {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  function resolved() {
    const stored = localStorage.getItem(KEY) || "auto"
    return stored === "auto" ? preferred() : stored
  }

  function apply(mode) {
    const stored = mode || localStorage.getItem(KEY) || "auto"
    localStorage.setItem(KEY, stored)
    if (stored === "auto") root.removeAttribute("data-theme")
    else root.setAttribute("data-theme", stored)
    if (themeLabel) themeLabel.textContent = labels[stored] ?? "Auto"
    document.querySelectorAll("[data-theme-set]").forEach((btn) => {
      btn.setAttribute("aria-current", String(btn.dataset.themeSet === stored))
    })
    document.dispatchEvent(new CustomEvent("docs-theme", { detail: resolved() }))
  }

  function closeAll(except) {
    boxes.forEach((box) => {
      if (box === except) return
      box.classList.remove("open")
      const btn = box.querySelector(".menu-btn")
      const list = box.querySelector(".menu-list")
      btn?.setAttribute("aria-expanded", "false")
      if (list) list.hidden = true
    })
  }

  boxes.forEach((box) => {
    const btn = box.querySelector(".menu-btn")
    const list = box.querySelector(".menu-list")
    btn?.addEventListener("click", (event) => {
      event.stopPropagation()
      const open = !box.classList.contains("open")
      closeAll()
      box.classList.toggle("open", open)
      btn.setAttribute("aria-expanded", String(open))
      if (list) list.hidden = !open
    })
  })

  document.addEventListener("click", () => closeAll())
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll()
  })

  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation()
      apply(btn.dataset.themeSet)
      closeAll()
    })
  })

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(KEY) || "auto") === "auto") apply("auto")
  })
  apply(localStorage.getItem(KEY) || "auto")

  const menu = document.querySelector("[data-menu]")
  const sidebar = document.querySelector(".sidebar")
  menu?.addEventListener("click", (event) => {
    event.stopPropagation()
    const open = sidebar.classList.toggle("expanded")
    menu.setAttribute("aria-expanded", String(open))
  })
})()
