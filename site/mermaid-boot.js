import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/+esm"

function theme() {
  const stored = localStorage.getItem("dsh-docs-theme") || "auto"
  const dark =
    stored === "dark" ||
    (stored === "auto" && matchMedia("(prefers-color-scheme: dark)").matches)
  return dark ? "dark" : "neutral"
}

async function renderAll() {
  const nodes = [...document.querySelectorAll("pre.mermaid, .mermaid")]
  if (nodes.length === 0) return
  mermaid.initialize({
    startOnLoad: false,
    theme: theme(),
    securityLevel: "strict",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  })
  for (const node of nodes) {
    if (!node.dataset.source) node.dataset.source = node.textContent
    node.removeAttribute("data-processed")
    node.textContent = node.dataset.source
  }
  await mermaid.run({ querySelector: "pre.mermaid, .mermaid" })
}

renderAll()
document.addEventListener("docs-theme", () => {
  renderAll()
})
