(() => {
  const KEY = "dsh-docs-theme"
  const root = document.documentElement
  const themeSelect = document.querySelector("[data-theme]")
  const langSelect = document.querySelector("[data-lang]")

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
    if (themeSelect) themeSelect.value = stored
    document.dispatchEvent(new CustomEvent("docs-theme", { detail: resolved() }))
  }

  themeSelect?.addEventListener("change", () => apply(themeSelect.value))
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(KEY) || "auto") === "auto") apply("auto")
  })
  apply(localStorage.getItem(KEY) || "auto")

  langSelect?.addEventListener("change", () => {
    const href = langSelect.value === "zh" ? langSelect.dataset.zh : langSelect.dataset.en
    if (href) location.href = href
  })

  const menu = document.querySelector("[data-menu]")
  const sidebar = document.querySelector(".sidebar")
  menu?.addEventListener("click", () => {
    const open = sidebar.classList.toggle("expanded")
    menu.setAttribute("aria-expanded", String(open))
  })
})()
