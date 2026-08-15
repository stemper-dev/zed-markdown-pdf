import * as fs from "fs";
import * as path from "path";

import puppeteer, { Browser } from "puppeteer-core";

import { Logger } from "../utils/logger";

const LAUNCH_ARGS = ["--disable-dev-shm-usage"];

/**
 * Launch a headless Chromium for printing.
 *
 * @remarks
 * Uses a locally installed browser ({@link findLocalBrowser}). Keeping browser
 * installation explicit avoids downloading and executing a large third-party
 * binary at export time.
 *
 * @param logger - Sink for which-browser diagnostics.
 * @returns A launched Puppeteer {@link Browser}.
 * @throws If no supported browser is installed.
 */
export async function launchBrowser(logger: Logger): Promise<Browser> {
  const localChrome = findLocalBrowser();
  if (!localChrome) {
    throw new Error(
      "No Chromium-based browser found. Install Chrome, Edge, Brave, or Chromium and retry.",
    );
  }

  logger.info(`Using local browser with its sandbox enabled: ${localChrome}`);
  return puppeteer.launch({
    executablePath: localChrome,
    headless: true,
    args: LAUNCH_ARGS,
  });
}

/**
 * Locate an installed Chromium-family browser for the current platform.
 *
 * @remarks
 * Probes a platform-specific list of well-known install locations (Chrome,
 * Edge, Brave, Chromium) and returns the first one that is a regular file.
 *
 * @returns The executable path, or `undefined` if none is found.
 */
export function findLocalBrowser(): string | undefined {
  const candidates: string[] = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"] ?? "";
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/brave-browser",
      "/snap/bin/chromium",
    );
  }
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}
