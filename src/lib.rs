use std::fs;
use zed_extension_api::{
    self as zed,
    serde_json::{self, Value},
    settings::LspSettings,
    LanguageServerId, Result,
};

const SIDECAR_REPO: &str = "stemper-dev/zed-markdown-pdf";
const SIDECAR_TAG: &str = concat!("v", env!("CARGO_PKG_VERSION"));
const SIDECAR_ARCHIVE_NAME: &str = "markdown-pdf-sidecar.tar.gz";
const SIDECAR_ENTRY: &str = "dist/server.js";

struct MarkdownPdfExtension {
    cached_sidecar_dir: Option<String>,
}

impl MarkdownPdfExtension {
    fn ensure_sidecar(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        if let Some(path) = &self.cached_sidecar_dir {
            let entry = format!("{path}/{SIDECAR_ENTRY}");
            if fs::metadata(&entry).is_ok_and(|m| m.is_file()) {
                return Ok(entry);
            }
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        // The native sidecar is executable code, so bind it to the extension's
        // own version rather than trusting whichever release happens to be latest.
        let release = zed::github_release_by_tag_name(SIDECAR_REPO, SIDECAR_TAG).map_err(|e| {
            format!(
                "No sidecar release `{SIDECAR_TAG}` found at github.com/{SIDECAR_REPO} ({e}). \
                 For local development, install the sidecar onto your PATH so the \
                 extension can find it via `which`:\n  \
                 cd <repo>/sidecar && npm ci --ignore-scripts && npm run build && npm link"
            )
        })?;

        let asset = release
            .assets
            .iter()
            .find(|a| a.name == SIDECAR_ARCHIVE_NAME)
            .ok_or_else(|| {
                format!(
                    "no asset named `{SIDECAR_ARCHIVE_NAME}` in release {}",
                    release.version
                )
            })?;

        let expected_download_prefix =
            format!("https://github.com/{SIDECAR_REPO}/releases/download/{SIDECAR_TAG}/");
        if !asset.download_url.starts_with(&expected_download_prefix) {
            return Err(format!(
                "refusing unexpected sidecar download URL: {}",
                asset.download_url
            ));
        }

        let version_dir = format!("sidecar-{SIDECAR_TAG}");
        let entry_path = format!("{version_dir}/{SIDECAR_ENTRY}");

        let already_present = fs::metadata(&entry_path).is_ok_and(|m| m.is_file());

        if !already_present {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );

            zed::download_file(
                &asset.download_url,
                &version_dir,
                zed::DownloadedFileType::GzipTar,
            )
            .map_err(|e| format!("failed to download sidecar archive: {e}"))?;

            zed::make_file_executable(&entry_path).ok();

            for entry in fs::read_dir(".").map_err(|e| e.to_string())?.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("sidecar-") && name != version_dir {
                    fs::remove_dir_all(entry.path()).ok();
                }
            }
        }

        self.cached_sidecar_dir = Some(version_dir.clone());
        Ok(entry_path)
    }
}

impl zed::Extension for MarkdownPdfExtension {
    fn new() -> Self {
        Self {
            cached_sidecar_dir: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let shell_env = worktree.shell_env();

        // Dev override — set MARKDOWN_PDF_SIDECAR_JS=/abs/path/to/dist/server.js
        // in your shell to bypass the GitHub release download entirely.
        if let Some(custom_js) = shell_env
            .iter()
            .find(|(k, _)| k == "MARKDOWN_PDF_SIDECAR_JS")
            .map(|(_, v)| v.clone())
        {
            if let Some(node) = worktree.which("node") {
                return Ok(zed::Command {
                    command: node,
                    args: vec![custom_js, "--stdio".to_string()],
                    env: shell_env,
                });
            }
        }

        if let Some(bin) = worktree.which("markdown-pdf-sidecar") {
            return Ok(zed::Command {
                command: bin,
                args: vec!["--stdio".to_string()],
                env: shell_env,
            });
        }

        let node = worktree.which("node").ok_or_else(|| {
            "Node.js (>= 22.12) must be installed and on PATH to use Markdown PDF Export."
                .to_string()
        })?;

        let sidecar_entry = self.ensure_sidecar(language_server_id)?;

        Ok(zed::Command {
            command: node,
            args: vec![sidecar_entry, "--stdio".to_string()],
            env: shell_env,
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<Value>> {
        // Hand the user's `lsp.markdown-pdf-lsp.settings` object to the sidecar
        // as the top-level config in its `markdown-pdf` section.
        let settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree)
            .ok()
            .and_then(|s| s.settings.clone())
            .unwrap_or_else(|| serde_json::json!({}));

        Ok(Some(serde_json::json!({
            "markdown-pdf": settings,
        })))
    }
}

zed::register_extension!(MarkdownPdfExtension);
