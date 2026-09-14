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
    if (themeLabel) themeLabel.textContent = labels[stored] ?? labels.auto
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

  const menu = document.querySelector("[data-menu]")
  const sidebar = document.querySelector(".sidebar")

  function closeSidebar() {
    sidebar?.classList.remove("expanded")
    menu?.setAttribute("aria-expanded", "false")
  }

  document.addEventListener("click", (event) => {
    closeAll()
    if (!event.target.closest(".sidebar") && !event.target.closest("[data-menu]")) closeSidebar()
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAll()
      closeSidebar()
    }
  })

  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    const key = btn.dataset.themeSet
    if (key && btn.textContent.trim()) labels[key] = btn.textContent.trim()
    btn.addEventListener("click", (event) => {
      event.stopPropagation()
      apply(btn.dataset.themeSet)
      closeAll()
    })
  })

  const SIZE_LEGACY = { sm: "16", md: "18", lg: "20" }

  function bindChoice(storageKey, attr, defaultValue, labelSel, btnSel, dataKey) {
    const labelEl = document.querySelector(labelSel)
    const buttons = [...document.querySelectorAll(btnSel)]
    const names = {}
    function applyChoice(value) {
      let stored = value || localStorage.getItem(storageKey) || defaultValue
      if (storageKey === "dsh-docs-size" && SIZE_LEGACY[stored]) stored = SIZE_LEGACY[stored]
      localStorage.setItem(storageKey, stored)
      root.setAttribute(attr, stored)
      if (labelEl) labelEl.textContent = names[stored] ?? stored
      buttons.forEach((btn) => {
        btn.setAttribute("aria-current", String(btn.dataset[dataKey] === stored))
      })
    }
    buttons.forEach((btn) => {
      const key = btn.dataset[dataKey]
      if (key && btn.textContent.trim()) names[key] = btn.textContent.trim()
      btn.addEventListener("click", (event) => {
        event.stopPropagation()
        applyChoice(key)
        closeAll()
      })
    })
    applyChoice(localStorage.getItem(storageKey) || defaultValue)
  }

  bindChoice("dsh-docs-font", "data-font", "serif", "[data-font-label]", "[data-font-set]", "fontSet")
  bindChoice("dsh-docs-size", "data-size", "18", "[data-size-label]", "[data-size-set]", "sizeSet")

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(KEY) || "auto") === "auto") apply("auto")
  })
  apply(localStorage.getItem(KEY) || "auto")

  menu?.addEventListener("click", (event) => {
    event.stopPropagation()
    if (!sidebar) return
    const open = sidebar.classList.toggle("expanded")
    menu.setAttribute("aria-expanded", String(open))
  })
})()
