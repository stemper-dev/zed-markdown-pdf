/*
 * Markdown PDF Export — native LSP sidecar (entrypoint).
 *
 * Runs outside the Zed WASM sandbox as a Node.js process. This module only
 * wires the LSP connection to the handlers; all behavior lives in:
 *   - config/   settings state and merge logic
 *   - markdown/  markdown-it rendering and Mermaid handling
 *   - html/      document assembly, stylesheets, asset inlining
 *   - pdf/       browser launch, page readiness, export pipeline
 *   - lsp/       server capabilities and code actions
 *
 * Pipeline: Markdown -> HTML (markdown-it + cheerio) -> headless Chromium -> PDF.
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  ExecuteCommandParams,
  InitializeParams,
  WorkDoneProgressReporter,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { COMMAND_EXPORT, COMMAND_EXPORT_AND_OPEN } from "./constants";
import { SettingsStore } from "./config/settings-store";
import { buildInitializeResult } from "./lsp/capabilities";
import { buildExportCodeActions } from "./lsp/code-actions";
import { exportMarkdownToPdf } from "./pdf/exporter";
import { openInSystemViewer } from "./utils/open";
import { isMarkdown } from "./utils/uri";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<TextDocument>(TextDocument);
const settings = new SettingsStore(connection);

connection.onInitialize((params: InitializeParams) => {
  settings.setSupportsPull(params.capabilities.workspace?.configuration === true);
  return buildInitializeResult();
});

connection.onInitialized(async () => {
  connection.console.info("markdown-pdf-sidecar initialized");
  await settings.registerForChanges();
});

connection.onDidChangeConfiguration(async (params) => {
  await settings.applyPush(params.settings);
});

connection.onCodeAction((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !isMarkdown(doc)) return [];
  return buildExportCodeActions(doc.uri);
});

connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
  const openAfter = params.command === COMMAND_EXPORT_AND_OPEN;
  if (params.command !== COMMAND_EXPORT && !openAfter) return;

  const uriArg = (params.arguments ?? [])[0];
  if (typeof uriArg !== "string") {
    connection.window.showErrorMessage("Markdown PDF: missing document URI.");
    return;
  }

  let reporter: WorkDoneProgressReporter | undefined;
  try {
    reporter = await connection.window.createWorkDoneProgress();
    reporter.begin("Exporting Markdown to PDF", 0, "Reading document…", true);

    const pdfPath = await exportMarkdownToPdf({
      documentUri: uriArg,
      settings: settings.snapshot,
      documents,
      logger: connection.console,
      progress: (message, percent) => reporter?.report(percent, message),
    });

    reporter.done();

    if (openAfter) {
      // Export succeeded; a failure to open is non-fatal — the PDF still exists.
      try {
        await openInSystemViewer(pdfPath);
      } catch (openErr) {
        const reason = openErr instanceof Error ? openErr.message : String(openErr);
        connection.console.error(`Could not open PDF: ${reason}`);
        connection.window.showWarningMessage(
          `PDF written to ${pdfPath}, but it could not be opened: ${reason}`,
        );
        return;
      }
    }

    connection.window.showInformationMessage(`PDF written: ${pdfPath}`);
  } catch (err) {
    reporter?.done();
    const message = err instanceof Error ? err.message : String(err);
    connection.console.error(`Export failed: ${message}`);
    connection.window.showErrorMessage(`Markdown PDF export failed: ${message}`);
  }
});

documents.listen(connection);
connection.listen();

process.on("unhandledRejection", (reason) => {
  connection.console.error(`unhandledRejection: ${String(reason)}`);
});
process.on("uncaughtException", (err) => {
  connection.console.error(`uncaughtException: ${err.stack ?? err.message}`);
});
