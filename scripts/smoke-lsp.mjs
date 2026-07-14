#!/usr/bin/env node
// Smoke-test the built sidecar over stdio: spawn it, perform the LSP `initialize`
// handshake, and assert the LSP surface Zed relies on is intact:
//
//   1. `executeCommandProvider.commands` advertises BOTH export commands. Zed
//      silently drops code-action commands that are NOT listed here, so a
//      missing entry is the most damaging regression.
//   2. `codeActionProvider` advertises the `source` kind.
//   3. A `textDocument/codeAction` request on a Markdown document returns
//      exactly the two `source.*` export actions, each wired to its command.
//
// Usage: node scripts/smoke-lsp.mjs <path-to-server.js>
// Exits 0 on success, non-zero (with a reason) on failure.

import { spawn } from "node:child_process";

const EXPECTED_COMMANDS = ["markdown.exportToPdf", "markdown.exportToPdfAndOpen"];
const TIMEOUT_MS = 15_000;
const serverPath = process.argv[2] ?? "sidecar/dist/server.js";
const DOC_URI = "file:///tmp/smoke-lsp-fixture.md";

function frame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

const child = spawn(process.execPath, [serverPath, "--stdio"], {
  stdio: ["pipe", "pipe", "inherit"],
});

const fail = (reason) => {
  console.error(`✗ sidecar smoke test failed: ${reason}`);
  child.kill("SIGKILL");
  process.exit(1);
};

const pass = (message) => {
  clearTimeout(timer);
  console.log(message);
  child.kill("SIGTERM");
  process.exit(0);
};

const timer = setTimeout(() => fail(`no valid response within ${TIMEOUT_MS}ms`), TIMEOUT_MS);

// Handlers keyed by request id; each returns the next message(s) to send (or none).
const pending = new Map();

function send(message) {
  child.stdin.write(frame(message));
}

function request(id, method, params, handler) {
  pending.set(id, handler);
  send({ jsonrpc: "2.0", id, method, params });
}

let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  // Pull complete Content-Length framed messages out of the stream.
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) return fail("malformed LSP header from server");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return; // wait for the rest
    const body = buffer.slice(start, start + length);
    buffer = buffer.slice(start + length);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return fail("invalid JSON in server response");
    }

    const handler = pending.get(msg.id);
    if (!handler) continue; // ignore log/notification traffic
    pending.delete(msg.id);
    handler(msg);
  }
});

child.on("error", (err) => fail(`could not spawn server: ${err.message}`));
child.on("exit", (code) => {
  if (code !== null && code !== 0) fail(`server exited early with code ${code}`);
});

// Step 1: initialize -> check the advertised capabilities.
request(
  1,
  "initialize",
  { processId: process.pid, rootUri: null, capabilities: {} },
  (msg) => {
    const caps = msg.result?.capabilities ?? {};
    const commands = caps.executeCommandProvider?.commands ?? [];
    for (const command of EXPECTED_COMMANDS) {
      if (!commands.includes(command)) {
        return fail(
          `executeCommandProvider does not advertise "${command}" (got: ${JSON.stringify(commands)})`,
        );
      }
    }
    const kinds = caps.codeActionProvider?.codeActionKinds ?? [];
    if (!kinds.includes("source")) {
      return fail(`codeActionProvider does not advertise the "source" kind (got: ${JSON.stringify(kinds)})`);
    }
    console.log(`✓ sidecar advertises ${EXPECTED_COMMANDS.map((c) => `"${c}"`).join(" + ")}`);
    console.log(`✓ codeActionProvider advertises the "source" kind`);

    // Open a Markdown buffer so the code-action handler recognizes it.
    send({ jsonrpc: "2.0", method: "initialized", params: {} });
    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: { uri: DOC_URI, languageId: "markdown", version: 1, text: "# Smoke\n" },
      },
    });

    // Step 2: request code actions for the open document.
    request(
      2,
      "textDocument/codeAction",
      {
        textDocument: { uri: DOC_URI },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context: { diagnostics: [] },
      },
      (actionMsg) => {
        const actions = actionMsg.result ?? [];
        if (!Array.isArray(actions) || actions.length !== 2) {
          return fail(`expected exactly 2 code actions, got: ${JSON.stringify(actions)}`);
        }
        for (const action of actions) {
          if (typeof action.kind !== "string" || !action.kind.startsWith("source")) {
            return fail(`code action kind is not a source.* kind: ${JSON.stringify(action)}`);
          }
        }
        const actionCommands = actions.map((a) => a.command?.command);
        for (const command of EXPECTED_COMMANDS) {
          if (!actionCommands.includes(command)) {
            return fail(
              `code actions do not include the "${command}" command (got: ${JSON.stringify(actionCommands)})`,
            );
          }
        }
        console.log(
          `✓ codeAction returns exactly 2 source.* actions (${actions.map((a) => a.kind).join(", ")})`,
        );
        pass("✓ sidecar LSP smoke test passed");
      },
    );
  },
);
