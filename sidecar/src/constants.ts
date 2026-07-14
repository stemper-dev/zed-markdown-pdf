/** LSP command id advertised in `executeCommandProvider` and dispatched by Zed. */
export const COMMAND_EXPORT = "markdown.exportToPdf";

/** Like {@link COMMAND_EXPORT}, but opens the PDF in the system viewer afterwards. */
export const COMMAND_EXPORT_AND_OPEN = "markdown.exportToPdfAndOpen";

/** Workspace configuration section that holds {@link ExportSettings}. */
export const SETTINGS_SECTION = "markdown-pdf";
