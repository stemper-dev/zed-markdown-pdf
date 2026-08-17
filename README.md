# Markdown PDF

## Background

I don't like Google Docs or Word. And these days AI works really well with
Markdown, so it just makes sense to write everything in Markdown and then
generate a PDF when I need a report. I wanted that same simple workflow inside
Zed, so I built this.

The **Markdown PDF Plus** extension for VS Code is amazing. Honestly, it is the
only reason I still have VS Code installed on my computer and just to turn my
Markdown into nice PDFs.

## Overview

Export any Markdown file to a beautifully styled PDF — without leaving [Zed](https://zed.dev).

Open a `.md` file, run **Export Markdown to PDF**, and a `.pdf` lands right next to
your document. Code blocks are syntax-highlighted, math renders with KaTeX,
Mermaid diagrams are drawn, and task lists, footnotes, and tables all carry over.

## Features

- 🖨️ One-action export to PDF from any Markdown buffer
- 🎨 Syntax highlighting (highlight.js) and clean, readable typography
- ➗ LaTeX math via KaTeX (`$inline$` and `$$block$$`)
- 📊 Mermaid diagrams
- ✅ GitHub-style task lists, footnotes, tables, and heading anchors
- 🧩 Custom CSS, page size, and margins via settings
- 🌐 Uses a browser you already have (Chrome / Edge / Brave / Chromium)

## Requirements

- **Node.js 22.23.2+** on your `PATH`. The export engine runs as a native helper
  process, which Zed launches with your installed `node`.
  > Tip: if Zed is opened from the macOS Dock/Finder and can't find `node`,
  > launch it once from a terminal (`zed`) so it inherits your shell `PATH`.
- **A Chromium-based browser** (Google Chrome, Edge, Brave, or Chromium) is used
  for rendering. The extension does not download or install browser binaries.

## Install

1. Open the command palette → **zed: extensions**.
2. Search for **Markdown PDF** and click **Install**.

The first export downloads the version-matched rendering helper; subsequent
exports are instant.

## Usage

1. Open any `.md` file.
2. Press **`cmd-.`** (macOS) or **`ctrl-.`** (Linux/Windows) to open the
   code-actions menu — or click the ⚡ icon that appears next to the line.
3. Choose **Export Markdown to PDF**.

![Running "Export Markdown to PDF" from the code-actions menu in Zed](./assets/export-code-action.png)

> Zed has no command-palette entry for extensions, so the export lives in the
> code-actions menu. Just remember: open a `.md`, hit **`cmd-.`**, pick
> **Export Markdown to PDF**.

The PDF is written next to your source file as `<filename>.pdf` (configurable
below). A progress notification shows each stage; a final notification reports the
written path.

## Settings

Configure exports in your Zed `settings.json` under the language server:

```json
{
  "lsp": {
    "markdown-pdf-lsp": {
      "settings": {
        "pageSize": "A4",
        "marginTop": "20mm",
        "marginBottom": "20mm",
        "marginLeft": "18mm",
        "marginRight": "18mm",
        "cssPath": "",
        "cssRaw": "",
        "usePageStyleFromCSS": false,
        "outputHome": "",
        "outputFilename": ""
      }
    }
  }
}
```

| Setting               | Default  | Description                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| `pageSize`            | `"A4"`   | Paper size (`A4`, `Letter`, `Legal`, …).                                    |
| `marginTop`           | `"20mm"` | Top margin (any CSS length).                                                |
| `marginBottom`        | `"20mm"` | Bottom margin.                                                              |
| `marginLeft`          | `"18mm"` | Left margin.                                                                |
| `marginRight`         | `"18mm"` | Right margin.                                                               |
| `cssPath`             | `""`     | Path to an extra stylesheet (absolute, or relative to the source file).     |
| `cssRaw`              | `""`     | Inline CSS injected as the highest-priority style layer.                    |
| `usePageStyleFromCSS` | `false`  | Defer page size and margins to the document's own `@page` CSS rules.        |
| `outputHome`          | `""`     | Output directory. Empty → the source file's directory (created if missing). |
| `outputFilename`      | `""`     | Output file name without extension. Empty → the source base name.           |

## Styling a single document

Beyond the global `cssPath` / `cssRaw` settings (which apply to *every* export),
you can style **one specific file** by embedding CSS directly in its Markdown.

### Inline `<style>` block

Drop a `<style>` block anywhere in the document (the top is tidiest):

```markdown
<style>
  h1 { color: #0969da; border-bottom: 2px solid #d0d7de; }
  .danger { color: #cf222e; font-weight: 700; }
</style>

# My Report

This paragraph has a <span class="danger">critical warning</span>.
```

### External stylesheet via `<link>`

Keep the CSS in a sibling file and link it. A relative `href` resolves against
the Markdown file's own directory, so a per-folder `report.css` "just works":

```markdown
<link rel="stylesheet" href="./report.css">

# My Report
```

```css
/* report.css, next to your .md */
.callout { border-left: 4px solid #0969da; background: #eef4fb; padding: 0.5em 1em; }
```

Remote sheets (`https://…`) and `url(...)` references inside a local sheet are
loaded too — local `url(...)` assets are inlined automatically.

### Defining and applying classes

There is no `{.class}` attribute syntax (no `markdown-it-attrs`); apply classes
with plain HTML, then target them from your CSS above:

- **Inline** — wrap a phrase in a span:

  ```markdown
  Status: <span class="badge">v1</span>
  ```

- **Block** — wrap a region in a `<div>`. ⚠️ **Leave a blank line** between the
  `<div>` tags and the Markdown inside, or the Markdown is treated as literal
  HTML and won't render:

  ```markdown
  <div class="callout">

  This **bold** text and the list below render correctly.

  - because of the blank lines above and below
  - the content is parsed as Markdown

  </div>
  ```

  Without the surrounding blank lines, `**bold**` would print verbatim as
  `**bold**`. This is standard CommonMark HTML-block behavior.

### Overriding the built-in defaults

The whole document is rendered inside `<article class="markdown-body">`, styled
by a bundled GitHub-flavored base theme (lowest priority). Your inline `<style>`
/ `<link>` always loads **after** it, so scoping a rule under `.markdown-body`
reliably wins. Some defaults worth knowing:

| Element              | Default                                                              | Override example                                              |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `body`               | `14px`, line-height `1.55`, color `#1f2328`, system sans-serif font | `.markdown-body { font-size: 12px; line-height: 1.4; }`       |
| Content width        | `max-width: 820px`, centered (removed in print)                     | `.markdown-body { max-width: none; }`                         |
| `h1`                 | `2em`, bottom border `1px solid #d0d7de`                            | `.markdown-body h1 { border-bottom: none; color: #0969da; }`  |
| `h2`                 | `1.5em`, bottom border `1px solid #d0d7de`                          | `.markdown-body h2 { border-bottom: none; }`                  |
| `h3` / `h4`          | `1.25em` / `1em`, weight `600`                                      | `.markdown-body h3 { font-size: 1.1em; }`                     |
| Headings (all)       | margin `1.6em 0 .6em`, line-height `1.25`                           | `.markdown-body h2 { margin-top: 2.4em; }`                    |
| `p, ul, ol, …`       | bottom margin `1em`                                                 | `.markdown-body p { margin-bottom: 1.4em; }`                  |
| Inline `code`        | `85%` size, `#f6f8fa` bg, `.2em .4em` padding, radius `6px`         | `.markdown-body code { background: #fff3cd; }`                |
| `pre` (code block)   | `#f6f8fa` bg, `1em` padding, radius `6px`                           | `.markdown-body pre { background: #0d1117; color: #fff; }`    |
| `blockquote`         | color `#57606a`, left border `.25em solid #d0d7de`                  | `.markdown-body blockquote { border-left-color: #0969da; }`   |
| `table` `th`/`td`    | collapsed, `1px solid #d0d7de` cells, `th` bg `#f6f8fa`             | `.markdown-body td { padding: 2px 8px; }`                     |
| `a` (links)          | color `#0969da`, no underline (underline on hover)                  | `.markdown-body a { color: #cf222e; }`                        |
| `hr`                 | `1px solid #d0d7de` top border                                      | `.markdown-body hr { border-top: 2px dashed #ccc; }`          |
| `img`                | `max-width: 100%`                                                   | `.markdown-body img { border: 1px solid #d0d7de; }`           |
| `.footnotes`         | `0.85em`, top border, `2em` top margin                             | `.markdown-body .footnotes { font-size: 0.75em; }`            |

For example, to tighten everything and recolor headings for one document:

```markdown
<style>
  .markdown-body { font-size: 12px; max-width: none; }
  .markdown-body h1, .markdown-body h2 { color: #0969da; border-bottom: none; }
</style>

# My Report
```

> Two layers sit *above* the base theme and below your styles: the bundled
> **highlight.js** theme (code-block syntax colors) and **KaTeX** CSS (math).
> Override those the same way — your `<style>` still wins on equal specificity.

## How it works

Zed extensions run in a `wasm32-wasip2` sandbox and can't spawn a browser directly.
This extension ships a thin WASM coordinator that launches a native **Node.js LSP
sidecar**; the sidecar renders Markdown → HTML (`markdown-it` + `cheerio`) and
prints it with headless Chromium (`puppeteer-core`). The export is offered as an
LSP code action because Zed surfaces those in the `cmd-.` menu.

```
+---------------------+        +-------------------------------+
| Zed (WASM sandbox)  |  LSP   | markdown-pdf sidecar (Node)   |
| src/lib.rs          | <----> | sidecar/dist/server.js        |
| - locates `node`    | stdio  | - markdown-it -> cheerio      |
| - downloads sidecar |        | - puppeteer-core -> page.pdf()|
+---------------------+        +-------------------------------+
```

## Development

```sh
# 1. Build the WASM coordinator
rustup target add wasm32-wasip2          # rustup-managed Rust required
cargo build --release --target wasm32-wasip2

# 2. Build the sidecar without running dependency lifecycle scripts
cd sidecar && npm ci --ignore-scripts && npm run build && cd ..

# 3. Run Zed against this folder, bypassing the GitHub release download
export MARKDOWN_PDF_SIDECAR_JS="$PWD/sidecar/dist/server.js"
zed --foreground .
# Zed: command palette → "zed: install dev extension" → pick this folder
# open any .md → cmd-. → "Export Markdown to PDF"
```

`MARKDOWN_PDF_SIDECAR_JS` points the coordinator at your local build so you don't
need a published release while iterating. Verify the LSP handshake at any time:

```sh
node scripts/smoke-lsp.mjs sidecar/dist/server.js
```

### Releasing

CI is tag-driven (`.github/workflows/release.yml`). Before releasing, enable
immutable releases, protect `v*` tags, configure required reviewers on the
`release` environment, and add a narrowly scoped `COMMITTER_TOKEN` there.

Then bump `version` in `extension.toml`, `Cargo.toml`, `sidecar/package.json`, and
both lockfiles, merge to `main`, and tag that commit with the matching `vX.Y.Z`.

## License

[MIT](./LICENSE)
