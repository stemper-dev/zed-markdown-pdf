import { spawn } from "child_process";

/**
 * Open a file in the operating system's default application.
 *
 * @remarks
 * Fire-and-forget: the opener is spawned detached with its stdio ignored and
 * unreferenced, so it outlives this call and never blocks or holds the server
 * open. The returned promise resolves only once the child has actually spawned
 * and rejects if it could not (e.g. the opener binary is missing), so callers
 * do not report a false success.
 *
 * @param filePath - Absolute path to open.
 */
export function openInSystemViewer(filePath: string): Promise<void> {
  const { command, args } = openerFor(process.platform, filePath);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      // Started successfully; let it run independently of this process.
      child.unref();
      resolve();
    });
  });
}

function openerFor(
  platform: NodeJS.Platform,
  filePath: string,
): { command: string; args: string[] } {
  switch (platform) {
    case "darwin":
      return { command: "open", args: [filePath] };
    case "win32":
      // Do NOT use `cmd /c start`: it re-parses the path, so a filename
      // containing & | ^ would run as a second command. PowerShell's
      // Start-Process -LiteralPath takes the path verbatim; single quotes are
      // escaped by doubling per PowerShell's literal-string rules.
      return {
        command: "powershell",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Start-Process -LiteralPath '${filePath.replace(/'/g, "''")}'`,
        ],
      };
    default:
      return { command: "xdg-open", args: [filePath] };
  }
}
