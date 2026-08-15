import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { DEFAULT_SETTINGS } = require("../dist/config/settings.js");
const { buildHtmlDocument } = require("../dist/html/document-builder.js");
const { launchBrowser } = require("../dist/pdf/browser.js");
const { exportMarkdownToPdf } = require("../dist/pdf/exporter.js");
const { waitForDynamicContent } = require("../dist/pdf/page-readiness.js");

const logger = {
  info() {},
  warn() {},
  error() {},
};

test("Mermaid is bundled locally with strict rendering", () => {
  const html = buildHtmlDocument(
    "```mermaid\ngraph TD; A-->B\n```",
    process.cwd(),
    "diagram",
    DEFAULT_SETTINGS,
    logger,
  );

  assert.match(html, /mermaid\.initialize\(\{ startOnLoad: true, securityLevel: "strict" \}\)/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});

test("bundled Mermaid renders without network access", async () => {
  const html = buildHtmlDocument(
    "```mermaid\ngraph TD; A-->B\n```",
    process.cwd(),
    "diagram",
    DEFAULT_SETTINGS,
    logger,
  );
  const browser = await launchBrowser(logger);

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().startsWith("http:") || request.url().startsWith("https:")) {
        void request.abort();
      } else {
        void request.continue();
      }
    });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await waitForDynamicContent(page);
    assert.ok(await page.$("pre.mermaid svg"), "expected Mermaid to produce an SVG");
  } finally {
    await browser.close();
  }
});

test("exports a Mermaid document through sandboxed local Chrome", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-pdf-test-"));
  const markdownPath = path.join(tempDir, "report.md");
  const pdfPath = path.join(tempDir, "report.pdf");

  try {
    await fs.writeFile(
      markdownPath,
      "# Hardened export\n\n```mermaid\ngraph TD; A-->B\n```\n",
      "utf8",
    );

    const result = await exportMarkdownToPdf({
      documentUri: pathToFileURL(markdownPath).href,
      settings: DEFAULT_SETTINGS,
      documents: { get: () => undefined },
      logger,
      progress() {},
    });

    assert.equal(result, pdfPath);
    const pdf = await fs.readFile(pdfPath);
    assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(pdf.length > 1_000, `expected a non-trivial PDF, got ${pdf.length} bytes`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
