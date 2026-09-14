#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "site", "dist")
const GH = "https://github.com/dravengarden/deepseek-harness-cloudflare"

const EN_CHAPTERS = [
  ["00-preface", "Preface"],
  ["01-harness", "The harness"],
  ["02-system-map", "System map"],
  ["03-identity", "Identity"],
  ["04-turn", "A turn"],
  ["05-plugins", "Plugins"],
  ["06-sandbox", "Linux sandbox"],
  ["07-persistence", "Persistence"],
  ["08-latency", "Latency"],
  ["09-web", "Web surfaces"],
  ["10-security", "Security"],
  ["11-operate", "Operate"],
  ["12-limits", "Limits"],
]

const ZH_CHAPTERS = [
  ["00-preface", "前言"],
  ["01-harness", "什么是 Harness"],
  ["02-system-map", "系统地图"],
  ["03-identity", "身份"],
  ["04-turn", "一轮 Turn"],
  ["05-plugins", "插件"],
  ["06-sandbox", "Linux 沙箱"],
  ["07-persistence", "持久化"],
  ["08-latency", "延迟"],
  ["09-web", "Web 界面"],
  ["10-security", "安全"],
  ["11-operate", "运维"],
  ["12-limits", "限制与替代"],
]

const REFERENCE = [
  ["architecture", "Architecture"],
  ["web", "Web"],
  ["containers", "Containers"],
  ["plugins", "Plugins"],
  ["core-gaps", "Core gaps"],
  ["sandbox-flyio", "Fly.io"],
]

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function inline(text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>")
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safe = href.replaceAll('"', "")
    return `<a href="${safe}">${label}</a>`
  })
  return out
}

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|\s*$/.test(line.replace(/[^\s:|\-]/g, "")) || /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line)
}

function renderTable(rows) {
  const cells = rows.map((row) =>
    row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  )
  const head = cells[0] ?? []
  const body = cells.slice(2)
  const th = head.map((cell) => `<th>${inline(cell)}</th>`).join("")
  const tr = body
    .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
    .join("")
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function renderMarkdown(src) {
  const fences = []
  let text = src.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "")
  text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = fences.length
    fences.push({ lang: lang.trim(), code: code.replace(/\n$/, "") })
    return `\n\n%%FENCE${id}%%\n\n`
  })

  const lines = text.split("\n")
  const html = []
  let i = 0
  let para = []
  let list = null

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(" "))}</p>`)
      para = []
    }
  }
  const flushList = () => {
    if (!list) return
    html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`)
    list = null
  }
  const flush = () => {
    flushPara()
    flushList()
  }

  while (i < lines.length) {
    const line = lines[i] ?? ""
    const fence = line.match(/^%%FENCE(\d+)%%$/)
    if (fence) {
      flush()
      const block = fences[Number(fence[1])]
      if (block.lang === "mermaid") {
        html.push(`<pre class="mermaid">${escapeHtml(block.code)}</pre>`)
      } else {
        html.push(`<pre><code>${escapeHtml(block.code)}</code></pre>`)
      }
      i += 1
      continue
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      flush()
      const rows = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? "")) {
        rows.push(lines[i] ?? "")
        i += 1
      }
      html.push(renderTable(rows))
      continue
    }
    if (/^#{1,3} /.test(line)) {
      flush()
      const level = line.match(/^#+/)[0].length
      const title = line.replace(/^#{1,3} /, "")
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
        .replace(/^-|-$/g, "")
      html.push(`<h${level} id="${id}">${inline(title)}</h${level}>`)
      i += 1
      continue
    }
    if (/^---+$/.test(line.trim())) {
      flush()
      html.push("<hr>")
      i += 1
      continue
    }
    if (/^> /.test(line)) {
      flush()
      const quote = []
      while (i < lines.length && /^> /.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^> /, ""))
        i += 1
      }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`)
      continue
    }
    const ul = line.match(/^[-*] (.+)/)
    const ol = line.match(/^\d+\. (.+)/)
    if (ul || ol) {
      flushPara()
      const tag = ul ? "ul" : "ol"
      const item = (ul || ol)[1]
      if (!list || list.tag !== tag) {
        flushList()
        list = { tag, items: [] }
      }
      list.items.push(item)
      i += 1
      continue
    }
    if (line.trim() === "") {
      flush()
      i += 1
      continue
    }
    flushList()
    para.push(line.trim())
    i += 1
  }
  flush()
  return html.join("\n")
}

function rewriteLinks(markdown, fromRel) {
  return markdown.replace(/\]\(([^)]+)\)/g, (full, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return full
    const [path, hash] = href.split("#")
    const suffix = hash ? `#${hash}` : ""
    const resolved = join(dirname(fromRel), path)
    let next = path
    if (resolved.endsWith("README.md") && resolved.includes("docs/book")) next = "../index.html"
    else if (resolved.endsWith("README.md")) next = `${GH}/blob/main/README.md`
    else if (path.endsWith(".md")) {
      const name = path.replace(/\.md$/, ".html")
      if (path.startsWith("../../") && !path.includes("/book/")) next = `../reference/${path.split("/").pop().replace(/\.md$/, ".html")}`
      else if (path.startsWith("../") && fromRel.includes("/book/")) {
        if (path === "../README.md") next = "../index.html"
        else next = name.replace(/^\.\.\//, "../")
      } else next = name
    }
    if (fromRel.startsWith("docs/") && !fromRel.includes("/book/") && path.endsWith(".md") && !path.includes("/")) {
      next = path.replace(/\.md$/, ".html")
    }
    if (fromRel.startsWith("docs/") && !fromRel.includes("/book/") && path.startsWith("book/")) {
      next = path.replace(/^book\/README\.md$/, "../index.html").replace(/\.md$/, ".html")
      if (next.startsWith("book/en/")) next = `../en/${next.slice("book/en/".length)}`
      if (next.startsWith("book/zh/")) next = `../zh/${next.slice("book/zh/".length)}`
    }
    return `](${next}${suffix})`
  })
}

function langSwitcher(lang, enHref, zhHref) {
  const enCur = lang === "zh" ? "" : ' aria-current="true"'
  const zhCur = lang === "zh" ? ' aria-current="true"' : ""
  return `<span class="lang" role="group" aria-label="Language">
      <a class="tool" href="${enHref}"${enCur} lang="en">EN</a>
      <a class="tool" href="${zhHref}"${zhCur} lang="zh">中文</a>
    </span>`
}

function layout({ title, lang, prefix, nav, body, pager, home, enHref, zhHref }) {
  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-Hans" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f6f4ef" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#141310" media="(prefers-color-scheme: dark)">
  <meta name="description" content="Documentation for DeepSeek Harness on Cloudflare.">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${prefix}styles.css">
</head>
<body class="${home ? "home" : ""}">
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="${prefix}index.html">DSH on Cloudflare</a>
    <nav aria-label="Primary">
      <a href="${prefix}en/00-preface.html">Book</a>
      <a href="${prefix}reference/architecture.html">Reference</a>
      <a href="${GH}">GitHub</a>
    </nav>
    <div class="tools">
      <button class="menu-toggle" type="button" data-menu aria-expanded="false">Menu</button>
      ${langSwitcher(lang, enHref, zhHref)}
      <button type="button" data-theme-set="auto">Auto</button>
      <button type="button" data-theme-set="light">Light</button>
      <button type="button" data-theme-set="dark">Dark</button>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      ${nav}
    </aside>
    <main id="main" class="article">
      <div class="prose">
        ${body}
        ${pager ?? ""}
      </div>
    </main>
  </div>
  <script src="${prefix}theme.js"></script>
  <script type="module" src="${prefix}mermaid-boot.js"></script>
</body>
</html>
`
}

function navHtml(lang, current) {
  const chapters = lang === "zh" ? ZH_CHAPTERS : EN_CHAPTERS
  const bookLabel = lang === "zh" ? "书" : "Book"
  const refLabel = lang === "zh" ? "参考" : "Reference"
  const bookLinks = chapters
    .map(([id, label]) => {
      const rel = current.startsWith("reference/")
        ? `../${lang}/${id}.html`
        : current.startsWith("en/") || current.startsWith("zh/")
          ? `${id}.html`
          : `${lang}/${id}.html`
      const cur = current === `${lang}/${id}.html` ? ' aria-current="page"' : ""
      return `<li><a href="${rel}"${cur}>${escapeHtml(label)}</a></li>`
    })
    .join("")
  const prefix = current.startsWith("reference/") ? "" : current.includes("/") ? "../reference/" : "reference/"
  const refLinks = REFERENCE.map(([id, label]) => {
    const href = `${prefix}${id}.html`
    const cur = current === `reference/${id}.html` ? ' aria-current="page"' : ""
    return `<li><a href="${href}"${cur}>${escapeHtml(label)}</a></li>`
  }).join("")
  return `<nav aria-label="${bookLabel}"><h2>${bookLabel}</h2><ol>${bookLinks}</ol><h2>${refLabel}</h2><ul>${refLinks}</ul></nav>`
}

function pagerHtml(lang, id) {
  const chapters = lang === "zh" ? ZH_CHAPTERS : EN_CHAPTERS
  const idx = chapters.findIndex(([key]) => key === id)
  if (idx < 0) return ""
  const prev = chapters[idx - 1]
  const next = chapters[idx + 1]
  const prevL = lang === "zh" ? "上一章" : "Previous"
  const nextL = lang === "zh" ? "下一章" : "Next"
  const left = prev ? `<a href="${prev[0]}.html"><span class="dir">${prevL}</span>${escapeHtml(prev[1])}</a>` : "<span></span>"
  const right = next ? `<a href="${next[0]}.html"><span class="dir">${nextL}</span>${escapeHtml(next[1])}</a>` : "<span></span>"
  return `<nav class="pager">${left}${right}</nav>`
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function prefixFor(rel) {
  return rel.includes("/") ? "../" : ""
}

function pageTitle(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].replace(/^[\d.\s·]+/, "").trim() : fallback
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
copyFileSync(join(root, "site", "styles.css"), join(dist, "styles.css"))
copyFileSync(join(root, "site", "theme.js"), join(dist, "theme.js"))
copyFileSync(join(root, "site", "mermaid-boot.js"), join(dist, "mermaid-boot.js"))
writeFileSync(join(dist, ".nojekyll"), "")

function emitMarkdown(srcRel, outRel, lang, extraPager) {
  const src = readFileSync(join(root, srcRel), "utf8")
  const rewritten = rewriteLinks(src, srcRel)
  const body = renderMarkdown(rewritten)
  const title = pageTitle(src, outRel)
  const file = outRel.split("/").pop()
  const enHref = outRel.startsWith("zh/") ? `../en/${file}` : file
  const zhHref = outRel.startsWith("en/")
    ? `../zh/${file}`
    : outRel.startsWith("zh/")
      ? file
      : "../zh/00-preface.html"
  const html = layout({
    title: `${title} · DSH on Cloudflare`,
    lang,
    prefix: prefixFor(outRel),
    nav: navHtml(lang, outRel),
    body,
    pager: extraPager,
    home: false,
    enHref,
    zhHref,
  })
  write(join(dist, outRel), html)
}

for (const [id] of EN_CHAPTERS) {
  emitMarkdown(`docs/book/en/${id}.md`, `en/${id}.html`, "en", pagerHtml("en", id))
}
for (const [id] of ZH_CHAPTERS) {
  emitMarkdown(`docs/book/zh/${id}.md`, `zh/${id}.html`, "zh", pagerHtml("zh", id))
}
for (const [id] of REFERENCE) {
  emitMarkdown(`docs/${id}.md`, `reference/${id}.html`, "en", "")
}

const home = layout({
  title: "DeepSeek Harness on Cloudflare",
  lang: "en",
  prefix: "",
  nav: navHtml("en", "index.html"),
  home: true,
  enHref: "index.html",
  zhHref: "zh/00-preface.html",
  body: `
    <h1>DeepSeek Harness on Cloudflare</h1>
    <p class="lede">Workers-native host. Cordis kernel, Durable Object session log, Linux in Cloudflare Sandbox. A documentation site for reading — not a landing page.</p>
    <p>Agent = Model + Harness. This port keeps the official kernel and hosts the rest on Workers. The book is the teaching narrative; the reference pages are the operator contract.</p>
    <div class="home-actions">
      <a class="primary" href="en/00-preface.html">Read in English</a>
      <a href="zh/00-preface.html">中文阅读</a>
      <a href="${GH}">GitHub</a>
    </div>
    <h2>Book</h2>
    <ol class="toc-inline">
      ${EN_CHAPTERS.map(([id, label]) => `<li><a href="en/${id}.html">${escapeHtml(label)}</a> · <a href="zh/${id}.html">${escapeHtml(ZH_CHAPTERS.find((row) => row[0] === id)?.[1] ?? "")}</a></li>`).join("\n")}
    </ol>
    <h2>Reference</h2>
    <ul>
      ${REFERENCE.map(([id, label]) => `<li><a href="reference/${id}.html">${escapeHtml(label)}</a></li>`).join("\n")}
    </ul>
    <p>Light and dark follow the system theme. Use Auto / Light / Dark in the header if you need to override. Type is sized for reading (about 18px, 40rem measure).</p>
  `,
})
write(join(dist, "index.html"), home)

const notFound = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./index.html"><title>Not found</title><p><a href="./index.html">Home</a></p>`
write(join(dist, "404.html"), notFound)

console.log(`site built → ${relative(root, dist)}`)
