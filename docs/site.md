# Documentation site

A small static site for **reading** the book and living docs. It is not a
marketing page. GitHub Pages serves it. The repo README is bilingual:
[README.md](../README.md) (English) and [README.zh.md](../README.zh.md).

Source: `site/styles.css`, `site/theme.js`, `site/mermaid-boot.js`,
`site/build.mjs`. Output: `site/dist/` (gitignored; CI builds it).

## Local

```bash
node site/build.mjs
python3 -m http.server 4173 --directory site/dist
```

Open `http://127.0.0.1:4173/`. Type is about 18px, measure 40rem, system
serif. Theme follows `prefers-color-scheme`. Header Auto / Light / Dark
overrides and is stored in `localStorage`. Mermaid loads from jsDelivr
and switches with the theme.

## GitHub Pages

Workflow: `.github/workflows/pages.yml`. After the first successful run:

1. Repo **Settings → Pages**
2. Source: **GitHub Actions**

The public URL is
`https://dravengarden.github.io/deepseek-harness-cloudflare/`.
All asset links are relative, so the project-pages subpath works.

Push to `main` rebuilds. Use **Actions → GitHub Pages → Run workflow**
for a manual deploy.
