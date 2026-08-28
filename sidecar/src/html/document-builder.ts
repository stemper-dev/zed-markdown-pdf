import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { URI } from "vscode-uri";

import { ExportSettings } from "../config/settings";
import { Logger } from "../utils/logger";
import { escapeHtml } from "../utils/html";
import { renderMarkdown } from "../markdown/renderer";
import { convertMermaidBlocks, mermaidRuntimeTag } from "../markdown/mermaid";
import { inlineLocalImages, inlineLocalCssUrls } from "./asset-inliner";
import { baseStylesheet, highlightJsCss, katexCss, buildPageRule } from "./stylesheets";

/** Convenience alias for a loaded Cheerio document. */
type Document = cheerio.CheerioAPI;

/**
 * Assemble a complete, self-contained HTML document from Markdown source.
 *
 * @remarks
 * Stylesheet precedence is layered, lowest to highest priority:
 *
 * 1. base GitHub-ish stylesheet
 * 2. bundled highlight.js theme
 * 3. bundled KaTeX CSS
 * 4. `@page` rule (margins / paper size)
 * 5. `settings.cssPath` file
 * 6. `settings.cssRaw` inline CSS
 *
 * `<link rel="stylesheet">` tags from the source are intentionally *not*
 * resolved here; they are attached later on the live Puppeteer page so they
 * outrank every bundled `<style>` block. See {@link applyUserStylesheets}.
 *
 * @param markdown - The Markdown source text.
 * @param sourceDir - Directory of the source file; the base for relative assets.
 * @param title - Document title (also used as the `<title>`).
 * @param settings - The active export settings.
 * @param logger - Sink for non-fatal warnings (e.g. an unreadable `cssPath`).
 * @returns The serialized HTML document.
 */
export function buildHtmlDocument(
  markdown: string,
  sourceDir: string,
  title: string,
  settings: ExportSettings,
  logger: Logger,
): string {
  const rawHtml = renderMarkdown(markdown);
  const $ = cheerio.load(
    `<!doctype html><html><head></head><body><article class="markdown-body">${rawHtml}</article></body></html>`,
  );

  appendDocumentHead($, title, sourceDir);
  appendBundledStyles($, settings);

  // Inline local <img src="…"> as base64 data URIs.
  inlineLocalImages($, sourceDir);

  injectMermaidRuntime($);
  appendUserStyles($, sourceDir, settings, logger);

  return $.html();
}

/**
 * Append the `<head>` metadata: charset, title, and a `<base href>` so relative
 * URLs resolve against the source directory.
 *
 * @param $ - The document under construction.
 * @param title - Document title.
 * @param sourceDir - Directory used to compute the `<base href>`.
 */
function appendDocumentHead($: Document, title: string, sourceDir: string): void {
  $("head").append(`<meta charset="utf-8">`);
  $("head").append(`<title>${escapeHtml(title)}</title>`);
  $("head").append(`<base href="${URI.file(sourceDir + path.sep).toString()}">`);
}

/**
 * Append the bundled style layers (base, highlight.js, KaTeX) and the optional
 * `@page` rule.
 *
 * @param $ - The document under construction.
 * @param settings - Active settings; `usePageStyleFromCSS` suppresses the `@page` layer.
 */
function appendBundledStyles($: Document, settings: ExportSettings): void {
  $("head").append(`<style id="mpe-base">${baseStylesheet()}</style>`);
  $("head").append(`<style id="mpe-hljs">${highlightJsCss()}</style>`);
  $("head").append(`<style id="mpe-katex">${katexCss()}</style>`);
  if (!settings.usePageStyleFromCSS) {
    $("head").append(`<style id="mpe-page">${buildPageRule(settings)}</style>`);
  }
}

/**
 * Normalize Mermaid code fences and inject the Mermaid runtime, but only when
 * the document actually contains diagram blocks.
 *
 * @param $ - The document under construction.
 */
function injectMermaidRuntime($: Document): void {
  convertMermaidBlocks($);
  if ($("pre.mermaid").length > 0) {
    $("head").append(mermaidRuntimeTag());
  }
}

/**
 * Append the user style layers: a file referenced by `cssPath` (with its local
 * `url(...)` references inlined) and the raw `cssRaw` block.
 *
 * @param $ - The document under construction.
 * @param sourceDir - Base directory for resolving a relative `cssPath`.
 * @param settings - Active settings supplying `cssPath` and `cssRaw`.
 * @param logger - Sink for a warning when `cssPath` is unreadable.
 */
function appendUserStyles(
  $: Document,
  sourceDir: string,
  settings: ExportSettings,
  logger: Logger,
): void {
  if (settings.cssPath) {
    const cssAbs = path.isAbsolute(settings.cssPath)
      ? settings.cssPath
      : path.resolve(sourceDir, settings.cssPath);
    try {
      const cssText = fs.readFileSync(cssAbs, "utf8");
      $("body").append(
        `<style id="mpe-user-file">${inlineLocalCssUrls(cssText, path.dirname(cssAbs))}</style>`,
      );
    } catch (e) {
      logger.warn(`cssPath ${cssAbs} unreadable: ${String(e)}`);
    }
  }

  if (settings.cssRaw) {
    $("body").append(`<style id="mpe-user-raw">${settings.cssRaw}</style>`);
  }
}
