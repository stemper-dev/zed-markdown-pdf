import { CodeAction, CodeActionKind, Command } from "vscode-languageserver/node";

import { COMMAND_EXPORT, COMMAND_EXPORT_AND_OPEN } from "../constants";

/**
 * Build the Markdown-to-PDF code actions for a document.
 *
 * @remarks
 * Zed dispatches `workspace/executeCommand` when the user applies a code action
 * whose `command.command` is advertised in `executeCommandProvider` (verified in
 * `zed/crates/project/src/lsp_store.rs`, `apply_code_action`). Both actions use
 * `source`-derived kinds — exporting is a source action, not a quickfix (which
 * implies fixing a diagnostic) — and Zed surfaces them in the `Ctrl+.` menu.
 *
 * @param documentUri - URI of the target document, forwarded as the command argument.
 * @returns The plain-export and export-and-open code actions.
 */
export function buildExportCodeActions(documentUri: string): CodeAction[] {
  return [
    {
      title: "Export Markdown to PDF",
      kind: `${CodeActionKind.Source}.exportToPdf`,
      command: {
        title: "Export to PDF",
        command: COMMAND_EXPORT,
        arguments: [documentUri],
      } satisfies Command,
    },
    {
      title: "Export Markdown to PDF and Open",
      kind: `${CodeActionKind.Source}.exportToPdfAndOpen`,
      command: {
        title: "Export to PDF and Open",
        command: COMMAND_EXPORT_AND_OPEN,
        arguments: [documentUri],
      } satisfies Command,
    },
  ];
}
