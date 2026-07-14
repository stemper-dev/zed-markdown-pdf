use std::{env, fs};
use zed_extension_api::{
    self as zed,
    serde_json::{self, Value},
    settings::LspSettings,
    LanguageServerId, Result,
};

const SIDECAR_REPO: &str = "stemper-dev/zed-markdown-pdf";
const SIDECAR_ARCHIVE_NAME: &str = "markdown-pdf-sidecar.tar.gz";
const SIDECAR_ENTRY: &str = "dist/server.js";

struct MarkdownPdfExtension {
    cached_sidecar_dir: Option<String>,
}

impl MarkdownPdfExtension {
    fn ensure_sidecar(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        // download_file extracts and fs operations resolve relative to the extension's
        // working directory, but the returned entry is consumed by `node`, whose cwd is
        // the worktree. Return an absolute path so node finds the sidecar regardless.
        let work_dir = env::current_dir()
            .map_err(|e| format!("failed to resolve extension working directory: {e}"))?;
        let absolute = |rel: &str| work_dir.join(rel).to_string_lossy().into_owned();

        if let Some(path) = &self.cached_sidecar_dir {
            let entry = format!("{path}/{SIDECAR_ENTRY}");
            if fs::metadata(&entry).map_or(false, |m| m.is_file()) {
                return Ok(absolute(&entry));
            }
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let release = zed::latest_github_release(
            SIDECAR_REPO,
            zed::GithubReleaseOptions {
                require_assets: true,
                pre_release: false,
            },
        )
        .map_err(|e| {
            format!(
                "No published sidecar release found at github.com/{SIDECAR_REPO} ({e}). \
                 For local development, install the sidecar onto your PATH so the \
                 extension can find it via `which`:\n  \
                 cd <repo>/sidecar && npm install && npm run build && npm link"
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

        let version_dir = format!("sidecar-{}", release.version);
        let entry_path = format!("{version_dir}/{SIDECAR_ENTRY}");

        let already_present = fs::metadata(&entry_path).map_or(false, |m| m.is_file());

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
        Ok(absolute(&entry_path))
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

        let node = worktree
            .which("node")
            .ok_or_else(|| "Node.js (>= 18) must be installed and on PATH to use Markdown PDF Export.".to_string())?;

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
