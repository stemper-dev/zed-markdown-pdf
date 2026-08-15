import {
  CodeActionKind,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { COMMAND_EXPORT } from "../constants";

/**
 * Build the capabilities advertised during the LSP `initialize` handshake.
 *
 * @remarks
 * Declares incremental text sync, a source code-action provider, and the
 * {@link COMMAND_EXPORT} execute-command provider.
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
        commands: [COMMAND_EXPORT],
      },
    },
  };
}
