#!/usr/bin/env node
// End-to-end render test: drive the built sidecar over stdio exactly as Zed does
// and assert it produces a real PDF. Unlike smoke-lsp.mjs (which only inspects
// the LSP handshake), this launches headless Chromium and runs the full
// Markdown -> HTML -> PDF pipeline against a fixture containing a fenced code
// block and TeX math, then checks the output starts with the `%PDF-` magic bytes.
//
// A system Chromium/Chrome is auto-detected by the sidecar (see pdf/browser.ts);
// no configuration is needed here. On CI, Ubuntu's restricted unprivileged user
// namespaces may require `sysctl kernel.apparmor_restrict_unprivileged_userns=0`
// for the sandbox — the sidecar otherwise retries once with `--no-sandbox`.
//
// Usage: node scripts/ci-render.mjs <path-to-server.js>
// Exits 0 on success, non-zero (with a reason) on failure.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const EXPORT_COMMAND = "markdown.exportToPdf";
const TIMEOUT_MS = 120_000;
const serverPath = process.argv[2] ?? "sidecar/dist/server.js";

const FIXTURE = `# CI Render Test

A paragraph with **bold** text to force real layout.

\`\`\`js
function add(a, b) {
  return a + b; // fenced code block -> highlight.js
}
\`\`\`

Inline math $E = mc^2$ and a display block:

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$
`;

// Fresh temp workspace; the sidecar writes <base>.pdf next to the source.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-render-"));
const mdPath = path.join(workDir, "fixture.md");
const pdfPath = path.join(workDir, "fixture.pdf");
fs.writeFileSync(mdPath, FIXTURE, "utf8");
const docUri = pathToFileURL(mdPath).toString();

function frame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

// Surface the server's own logs/diagnostics on failure.
const child = spawn(process.execPath, [serverPath, "--stdio"], {
  stdio: ["pipe", "pipe", "inherit"],
});

function cleanup() {
  fs.rmSync(workDir, { recursive: true, force: true });
}

const fail = (reason) => {
  console.error(`✗ ci render test failed: ${reason}`);
  clearTimeout(timer);
  child.kill("SIGKILL");
  cleanup();
  process.exit(1);
};

const timer = setTimeout(() => fail(`no export result within ${TIMEOUT_MS}ms`), TIMEOUT_MS);

function send(message) {
  child.stdin.write(frame(message));
}

let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) return fail("malformed LSP header from server");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.slice(start, start + length);
    buffer = buffer.slice(start + length);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return fail("invalid JSON in server response");
    }
    handleMessage(msg);
  }
});

child.on("error", (err) => fail(`could not spawn server: ${err.message}`));
child.on("exit", (code) => {
  if (code !== null && code !== 0) fail(`server exited early with code ${code}`);
});

function handleMessage(msg) {
  // The sidecar reports failures via `window/showMessage` (type 1 = Error).
  if (msg.method === "window/showMessage" && msg.params?.type === 1) {
    return fail(`server reported an error: ${msg.params.message}`);
  }

  if (msg.id === 1 && msg.result) {
    // initialize acknowledged -> open the document, then request the export.
    send({ jsonrpc: "2.0", method: "initialized", params: {} });
    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: { uri: docUri, languageId: "markdown", version: 1, text: FIXTURE },
      },
    });
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "workspace/executeCommand",
      params: { command: EXPORT_COMMAND, arguments: [docUri] },
    });
    return;
  }

  if (msg.id === 2) {
    // executeCommand resolved (the server awaits the full export before replying).
    verifyPdf();
  }
}

function verifyPdf() {
  clearTimeout(timer);
  if (!fs.existsSync(pdfPath)) {
    return fail(`expected PDF was not written: ${pdfPath}`);
  }
  const fd = fs.openSync(pdfPath, "r");
  const head = Buffer.alloc(5);
  fs.readSync(fd, head, 0, 5, 0);
  fs.closeSync(fd);
  const size = fs.statSync(pdfPath).size;
  if (head.toString("latin1") !== "%PDF-") {
    return fail(`output does not start with %PDF- magic (got: ${JSON.stringify(head.toString("latin1"))})`);
  }
  console.log(`✓ rendered ${pdfPath} (${size} bytes) — starts with %PDF-`);
  child.kill("SIGTERM");
  cleanup();
  process.exit(0);
}

// Do NOT advertise `window.workDoneProgress`: the sidecar then skips the
// progress-create round-trip we would otherwise have to answer.
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { processId: process.pid, rootUri: pathToFileURL(workDir).toString(), capabilities: {} },
});
