(() => {
  const KEY = "dsh-docs-theme"
  const root = document.documentElement
  const buttons = [...document.querySelectorAll("[data-theme-set]")]

  function preferred() {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  function current() {
    const stored = localStorage.getItem(KEY) || "auto"
    return stored === "auto" ? preferred() : stored
  }

  function apply(mode) {
    const stored = mode || localStorage.getItem(KEY) || "auto"
    localStorage.setItem(KEY, stored)
    if (stored === "auto") root.removeAttribute("data-theme")
    else root.setAttribute("data-theme", stored)
    buttons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeSet === stored))
    })
    document.dispatchEvent(new CustomEvent("docs-theme", { detail: current() }))
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => apply(btn.dataset.themeSet))
  })
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(KEY) || "auto") === "auto") apply("auto")
  })
  apply(localStorage.getItem(KEY) || "auto")

  const menu = document.querySelector("[data-menu]")
  const sidebar = document.querySelector(".sidebar")
  menu?.addEventListener("click", () => {
    const open = sidebar.classList.toggle("expanded")
    menu.setAttribute("aria-expanded", String(open))
  })
})()
