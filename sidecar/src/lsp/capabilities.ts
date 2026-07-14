import {
  CodeActionKind,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { COMMAND_EXPORT, COMMAND_EXPORT_AND_OPEN } from "../constants";

/**
 * Build the capabilities advertised during the LSP `initialize` handshake.
 *
 * @remarks
 * Declares incremental text sync, a Source code-action provider, and the
 * export execute-commands. Both {@link COMMAND_EXPORT} and
 * {@link COMMAND_EXPORT_AND_OPEN} must be advertised here or Zed silently drops
 * the corresponding code-action command.
 *
 * @returns The {@link InitializeResult} returned from `onInitialize`.
 */
export function buildInitializeResult(): InitializeResult {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.Source],
      },
      executeCommandProvider: {
        commands: [COMMAND_EXPORT, COMMAND_EXPORT_AND_OPEN],
      },
    },
  };
}
