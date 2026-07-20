use flate2::read::GzDecoder;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tempfile::TempDir;

const REPOSITORY: &str = "Complexity-ML/labo-ai";
const NODE_VERSION: &str = "v22.14.0";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    tarball_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct InstallState {
    installed_tag: Option<String>,
    installed_at: Option<u64>,
    app_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    installed_tag: Option<String>,
    latest_tag: Option<String>,
    app_path: String,
    platform: &'static str,
    setup_version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    tag: String,
    path: String,
    setup_relaunched: bool,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: String,
    message: String,
    percent: u8,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("LABO-AI-Setup")
        .build()
        .map_err(|error| error.to_string())
}

fn latest_release() -> Result<GitHubRelease, String> {
    let api_result = client()?
        .get(format!(
            "https://api.github.com/repos/{REPOSITORY}/releases/latest"
        ))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Unable to check GitHub: {error}"))?
        .json::<GitHubRelease>()
        .map_err(|error| format!("Invalid GitHub release response: {error}"));
    api_result.or_else(|api_error| {
        let response = client()?
            .get(format!("https://github.com/{REPOSITORY}/releases/latest"))
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|fallback_error| {
                format!("Unable to check GitHub: {api_error}; fallback failed: {fallback_error}")
            })?;
        let tag_name = response
            .url()
            .path_segments()
            .and_then(|segments| segments.last())
            .filter(|tag| tag.starts_with('v'))
            .ok_or_else(|| format!("Unable to resolve the latest GitHub tag after: {api_error}"))?
            .to_string();
        let asset_names = [
            "LABO-AI-Setup-arm64-helper",
            "LABO-AI-Setup-arm64-helper.sha256",
            "LABO-AI-Setup-x64-helper.exe",
            "LABO-AI-Setup-x64-helper.exe.sha256",
        ];
        Ok(GitHubRelease {
            tarball_url: format!(
                "https://github.com/{REPOSITORY}/archive/refs/tags/{tag_name}.tar.gz"
            ),
            assets: asset_names
                .iter()
                .map(|name| GitHubAsset {
                    name: (*name).to_string(),
                    browser_download_url: format!(
                        "https://github.com/{REPOSITORY}/releases/download/{tag_name}/{name}"
                    ),
                })
                .collect(),
            tag_name,
        })
    })
}

fn install_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        return dirs::data_local_dir()
            .map(|path| path.join("LABO AI").join("setup-data"))
            .ok_or_else(|| "No local application-data directory is available".to_string());
    }
    #[cfg(not(target_os = "windows"))]
    dirs::data_local_dir()
        .map(|path| path.join("LABO AI Setup"))
        .ok_or_else(|| "No local application-data directory is available".to_string())
}

fn electron_user_data() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir()
            .map(|path| path.join("Library/Application Support/LABO AI"))
            .ok_or_else(|| "No home directory is available".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        return dirs::config_dir()
            .map(|path| path.join("LABO AI"))
            .ok_or_else(|| "No roaming application-data directory is available".to_string());
    }
    #[allow(unreachable_code)]
    install_root()
}

fn app_destination() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir()
            .map(|path| path.join("Applications/LABO AI.app"))
            .ok_or_else(|| "No home directory is available".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        return dirs::data_local_dir()
            .map(|path| path.join("Programs/LABO AI"))
            .ok_or_else(|| "No local application-data directory is available".to_string());
    }
    #[allow(unreachable_code)]
    Err("LABO AI Setup currently supports macOS and Windows".to_string())
}

fn state_path() -> Result<PathBuf, String> {
    Ok(install_root()?.join("install-state.json"))
}

fn read_state() -> InstallState {
    state_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn status() -> Result<SetupStatus, String> {
    let state = read_state();
    let latest_tag = latest_release().ok().map(|release| release.tag_name);
    Ok(SetupStatus {
        installed_tag: state.installed_tag,
        latest_tag,
        app_path: app_destination()?.display().to_string(),
        platform: env::consts::OS,
        setup_version: env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
fn setup_status() -> Result<SetupStatus, String> {
    status()
}

fn emit(app: &AppHandle, stage: &str, message: impl Into<String>, percent: u8) {
    let _ = app.emit(
        "setup-progress",
        ProgressEvent {
            stage: stage.to_string(),
            message: message.into(),
            percent,
        },
    );
}

fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut response = client()?
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Download failed: {error}"))?;
    let mut bytes = Vec::new();
    response
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn helper_destination() -> Result<PathBuf, String> {
    let extension = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    Ok(electron_user_data()?
        .join("installer")
        .join(format!("labo-ai-setup{extension}")))
}

fn setup_helper_asset() -> Result<&'static str, String> {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "aarch64") => Ok("LABO-AI-Setup-arm64-helper"),
        ("macos", "x86_64") => Ok("LABO-AI-Setup-x64-helper"),
        ("windows", "x86_64") => Ok("LABO-AI-Setup-x64-helper.exe"),
        ("windows", "aarch64") => Ok("LABO-AI-Setup-arm64-helper.exe"),
        _ => Err(format!(
            "Unsupported Setup helper platform: {} {}",
            env::consts::OS,
            env::consts::ARCH
        )),
    }
}

fn version_parts(value: &str) -> Option<Vec<u64>> {
    value
        .trim_start_matches('v')
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()
}

fn release_is_newer(tag: &str) -> bool {
    match (version_parts(tag), version_parts(env!("CARGO_PKG_VERSION"))) {
        (Some(latest), Some(current)) => latest > current,
        _ => false,
    }
}

fn relaunch_latest_setup(app: &AppHandle, release: &GitHubRelease) -> Result<bool, String> {
    if !release_is_newer(&release.tag_name) {
        return Ok(false);
    }
    let asset_name = setup_helper_asset()?;
    let checksum_name = format!("{asset_name}.sha256");
    let helper_asset = release
        .assets
        .iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("Latest release does not contain {asset_name}"))?;
    let checksum_asset = release
        .assets
        .iter()
        .find(|asset| asset.name == checksum_name)
        .ok_or_else(|| format!("Latest release does not contain {checksum_name}"))?;

    emit(
        app,
        "Setup update",
        format!(
            "Updating LABO AI Setup to {} before continuing…",
            release.tag_name
        ),
        8,
    );
    let expected = String::from_utf8(download(&checksum_asset.browser_download_url)?)
        .map_err(|error| error.to_string())?
        .split_whitespace()
        .next()
        .ok_or_else(|| "Setup checksum file is empty".to_string())?
        .to_lowercase();
    let bytes = download(&helper_asset.browser_download_url)?;
    let actual = format!("{:x}", Sha256::digest(&bytes));
    if actual != expected {
        return Err(format!("SHA-256 mismatch for {asset_name}"));
    }

    let destination = helper_destination()?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let next = destination.with_file_name(if cfg!(target_os = "windows") {
        "labo-ai-setup-next.exe"
    } else {
        "labo-ai-setup-next"
    });
    fs::write(&next, bytes).map_err(|error| format!("Unable to stage the new Setup: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&next, fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    Command::new(next)
        .arg("--auto-install")
        .spawn()
        .map_err(|error| format!("Unable to relaunch the updated Setup: {error}"))?;
    Ok(true)
}

fn only_child_directory(path: &Path) -> Result<PathBuf, String> {
    fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|entry| entry.is_dir())
        .ok_or_else(|| format!("Archive did not contain a directory: {}", path.display()))
}

fn extract_tar_gz(bytes: &[u8], destination: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let decoder = GzDecoder::new(Cursor::new(bytes));
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(destination)
        .map_err(|error| format!("Archive extraction failed: {error}"))?;
    only_child_directory(destination)
}

fn extract_zip(bytes: &[u8], destination: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let output = destination.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|error| error.to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut file = fs::File::create(output).map_err(|error| error.to_string())?;
            io::copy(&mut entry, &mut file).map_err(|error| error.to_string())?;
        }
    }
    only_child_directory(destination)
}

fn node_asset() -> Result<(&'static str, &'static str), String> {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "aarch64") => Ok(("node-v22.14.0-darwin-arm64.tar.gz", "tar.gz")),
        ("macos", "x86_64") => Ok(("node-v22.14.0-darwin-x64.tar.gz", "tar.gz")),
        ("windows", "x86_64") => Ok(("node-v22.14.0-win-x64.zip", "zip")),
        ("windows", "aarch64") => Ok(("node-v22.14.0-win-arm64.zip", "zip")),
        _ => Err(format!(
            "Unsupported platform: {} {}",
            env::consts::OS,
            env::consts::ARCH
        )),
    }
}

fn ensure_node(app: &AppHandle) -> Result<PathBuf, String> {
    let runtime = install_root()?.join(format!(
        "runtime/node-{NODE_VERSION}-{}-{}",
        env::consts::OS,
        env::consts::ARCH
    ));
    let npm = if cfg!(target_os = "windows") {
        runtime.join("npm.cmd")
    } else {
        runtime.join("bin/npm")
    };
    if npm.exists() {
        return Ok(runtime);
    }

    emit(app, "Runtime", "Downloading the managed Node.js build…", 22);
    let (asset, kind) = node_asset()?;
    let base = format!("https://nodejs.org/dist/{NODE_VERSION}");
    let checksums = String::from_utf8(download(&format!("{base}/SHASUMS256.txt"))?)
        .map_err(|error| error.to_string())?;
    let expected = checksums
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let digest = parts.next()?;
            let filename = parts.next()?.trim_start_matches('*');
            (filename == asset).then(|| digest.to_string())
        })
        .ok_or_else(|| format!("No official Node.js checksum found for {asset}"))?;
    let bytes = download(&format!("{base}/{asset}"))?;
    let actual = format!("{:x}", Sha256::digest(&bytes));
    if actual != expected {
        return Err(format!("Node.js checksum mismatch for {asset}"));
    }

    let temporary = TempDir::new_in(install_root()?).map_err(|error| error.to_string())?;
    let extracted = if kind == "zip" {
        extract_zip(&bytes, temporary.path())?
    } else {
        extract_tar_gz(&bytes, temporary.path())?
    };
    if let Some(parent) = runtime.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(extracted, &runtime)
        .map_err(|error| format!("Cannot install Node.js runtime: {error}"))?;
    Ok(runtime)
}

fn run_npm(node_root: &Path, source: &Path, arguments: &[&str]) -> Result<(), String> {
    let npm = if cfg!(target_os = "windows") {
        node_root.join("npm.cmd")
    } else {
        node_root.join("bin/npm")
    };
    let node_bin = if cfg!(target_os = "windows") {
        node_root.to_path_buf()
    } else {
        node_root.join("bin")
    };
    let mut search_paths = vec![node_bin];
    if let Some(current) = env::var_os("PATH") {
        search_paths.extend(env::split_paths(&current));
    }
    let output = Command::new(&npm)
        .args(arguments)
        .current_dir(source)
        .env(
            "PATH",
            env::join_paths(search_paths).map_err(|error| error.to_string())?,
        )
        .output()
        .map_err(|error| format!("Unable to run npm: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let tail = stderr
        .lines()
        .rev()
        .take(18)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Err(format!(
        "npm command failed ({})\n{tail}",
        arguments.join(" ")
    ))
}

#[cfg(target_os = "macos")]
fn built_application(source: &Path) -> PathBuf {
    let folder = if env::consts::ARCH == "aarch64" {
        "mac-arm64"
    } else {
        "mac"
    };
    source.join("release").join(folder).join("LABO AI.app")
}

#[cfg(target_os = "windows")]
fn built_application(source: &Path) -> PathBuf {
    let folder = if env::consts::ARCH == "aarch64" {
        "win-arm64-unpacked"
    } else {
        "win-unpacked"
    };
    source.join("release").join(folder)
}

fn copy_application(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        fs::remove_dir_all(destination).map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    let status = Command::new("/bin/cp")
        .arg("-R")
        .arg(source)
        .arg(destination)
        .status();
    #[cfg(target_os = "windows")]
    let status = Command::new("robocopy")
        .arg(source)
        .arg(destination)
        .arg("/E")
        .arg("/NFL")
        .arg("/NDL")
        .status();
    let status = status.map_err(|error| format!("Unable to copy LABO AI: {error}"))?;
    #[cfg(target_os = "macos")]
    let success = status.success();
    #[cfg(target_os = "windows")]
    let success = status.code().is_some_and(|code| code <= 7);
    if success {
        Ok(())
    } else {
        Err(format!("Application copy failed with {status}"))
    }
}

fn install_helper() -> Result<(), String> {
    let destination = helper_destination()?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let current = env::current_exe().map_err(|error| error.to_string())?;
    if current != destination {
        fs::copy(current, &destination)
            .map_err(|error| format!("Unable to install update helper: {error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&destination, fs::Permissions::from_mode(0o755))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn launch_application(destination: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    Command::new("/usr/bin/open")
        .arg(destination)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    Command::new(destination.join("LABO AI.exe"))
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn powershell_literal(value: &Path) -> String {
    value.display().to_string().replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<(), String> {
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .status()
        .map_err(|error| format!("Unable to configure the Windows application entry: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Windows application integration failed with status {status}"
        ))
    }
}

#[cfg(target_os = "windows")]
fn install_windows_integration(destination: &Path, release_tag: &str) -> Result<(), String> {
    let executable = destination.join("LABO AI.exe");
    if !executable.is_file() {
        return Err(format!(
            "The installed Windows executable is missing at {}",
            executable.display()
        ));
    }

    let uninstall_script = install_root()?.join("uninstall-labo-ai.ps1");
    let uninstall_body = format!(
        "$ErrorActionPreference = 'SilentlyContinue'\n\
         Stop-Process -Name 'LABO AI' -Force\n\
         Start-Sleep -Milliseconds 400\n\
         Remove-Item -LiteralPath '{}' -Recurse -Force\n\
         $shell = New-Object -ComObject WScript.Shell\n\
         Remove-Item -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'LABO AI.lnk')) -Force\n\
         Remove-Item -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'LABO AI.lnk')) -Force\n\
         Remove-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LABO AI' -Recurse -Force\n",
        powershell_literal(destination)
    );
    fs::write(&uninstall_script, uninstall_body)
        .map_err(|error| format!("Unable to create the LABO AI uninstaller: {error}"))?;

    let executable_literal = powershell_literal(&executable);
    let destination_literal = powershell_literal(destination);
    let uninstall_literal = powershell_literal(&uninstall_script);
    let display_version = release_tag.trim_start_matches('v').replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference = 'Stop'; \
         $exe = '{executable_literal}'; \
         $shell = New-Object -ComObject WScript.Shell; \
         foreach ($link in @([IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'LABO AI.lnk'), [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'LABO AI.lnk'))) {{ \
           $shortcut = $shell.CreateShortcut($link); \
           $shortcut.TargetPath = $exe; \
           $shortcut.WorkingDirectory = '{destination_literal}'; \
           $shortcut.IconLocation = \"$exe,0\"; \
           $shortcut.Description = 'LABO AI neural architecture laboratory'; \
           $shortcut.Save(); \
         }}; \
         $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LABO AI'; \
         New-Item -Path $key -Force | Out-Null; \
         New-ItemProperty -Path $key -Name DisplayName -Value 'LABO AI' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name DisplayVersion -Value '{display_version}' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name Publisher -Value 'Complexity-ML' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name InstallLocation -Value '{destination_literal}' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name DisplayIcon -Value \"$exe,0\" -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name URLInfoAbout -Value 'https://www.complexity-ai.fr/labo-ai' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name UninstallString -Value 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{uninstall_literal}\"' -PropertyType String -Force | Out-Null; \
         New-ItemProperty -Path $key -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null; \
         New-ItemProperty -Path $key -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null"
    );
    run_powershell(&script)
}

#[cfg(target_os = "windows")]
fn schedule_windows_setup_cleanup() -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    let process_id = std::process::id();
    let script = format!(
        "$ErrorActionPreference = 'SilentlyContinue'; \
         Wait-Process -Id {process_id}; \
         Start-Sleep -Milliseconds 500; \
         Remove-Item -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'LABO AI Setup.lnk')) -Force; \
         Remove-Item -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'LABO AI Setup.lnk')) -Force; \
         $setupDirectories = @(); \
         Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | \
           Where-Object {{ $_.DisplayName -eq 'LABO AI Setup' }} | \
           ForEach-Object {{ \
             if ($_.InstallLocation -and ([IO.Path]::GetFileName($_.InstallLocation.TrimEnd('\\')) -eq 'LABO AI Setup')) {{ $setupDirectories += $_.InstallLocation }}; \
             Remove-Item -LiteralPath $_.PSPath -Recurse -Force \
           }}; \
         foreach ($directory in $setupDirectories) {{ \
           if (Test-Path -LiteralPath $directory) {{ Remove-Item -LiteralPath $directory -Recurse -Force }} \
         }}"
    );
    Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("Unable to schedule Setup cleanup: {error}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn prepare_application_handoff(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .hide()
            .map_err(|error| format!("Unable to hide LABO AI Setup: {error}"))?;
    }
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| format!("Unable to remove LABO AI Setup from the Dock: {error}"))?;
    thread::sleep(Duration::from_millis(250));
    Ok(())
}

#[cfg(target_os = "windows")]
fn prepare_application_handoff(_app: &AppHandle) -> Result<(), String> {
    if let Some(window) = _app.get_webview_window("main") {
        window
            .hide()
            .map_err(|error| format!("Unable to hide LABO AI Setup: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn restore_setup_after_handoff_failure(app: &AppHandle) {
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn restore_setup_after_handoff_failure(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn stop_running_application() {
    let _ = Command::new("taskkill")
        .args(["/IM", "LABO AI.exe", "/T", "/F"])
        .output();
    thread::sleep(Duration::from_millis(300));
}

#[cfg(not(target_os = "windows"))]
fn stop_running_application() {}

fn activate_application(next: &Path, destination: &Path, previous: &Path) -> Result<(), String> {
    if previous.exists() {
        fs::remove_dir_all(previous).map_err(|error| error.to_string())?;
    }
    let had_previous = destination.exists();
    if had_previous {
        fs::rename(destination, previous)
            .map_err(|error| format!("Unable to preserve the previous LABO AI build: {error}"))?;
    }
    if let Err(error) = fs::rename(next, destination) {
        if had_previous && previous.exists() {
            let _ = fs::rename(previous, destination);
        }
        return Err(format!(
            "Unable to activate the new LABO AI build; the previous build was restored: {error}"
        ));
    }
    Ok(())
}

fn perform_install(app: &AppHandle) -> Result<InstallResult, String> {
    fs::create_dir_all(install_root()?).map_err(|error| error.to_string())?;
    emit(app, "Release", "Checking the latest LABO AI release…", 5);
    let release = latest_release()?;
    if relaunch_latest_setup(app, &release)? {
        return Ok(InstallResult {
            tag: release.tag_name,
            path: String::new(),
            setup_relaunched: true,
        });
    }

    emit(
        app,
        "Source",
        format!("Downloading source for {}…", release.tag_name),
        12,
    );
    let source_bytes = download(&release.tarball_url)?;
    let source_temp = TempDir::new_in(install_root()?).map_err(|error| error.to_string())?;
    let source = extract_tar_gz(&source_bytes, source_temp.path())?;
    let node = ensure_node(app)?;

    emit(
        app,
        "Dependencies",
        "Installing locked JavaScript dependencies…",
        36,
    );
    run_npm(&node, &source, &["ci"])?;
    emit(
        app,
        "Build",
        "Building the LABO AI interface and secure desktop bridge…",
        55,
    );
    #[cfg(target_os = "macos")]
    run_npm(
        &node,
        &source,
        &[
            "run",
            "package:mac:dir",
            "--",
            if env::consts::ARCH == "aarch64" {
                "--arm64"
            } else {
                "--x64"
            },
        ],
    )?;
    #[cfg(target_os = "windows")]
    run_npm(
        &node,
        &source,
        &[
            "run",
            "package:win:dir",
            "--",
            if env::consts::ARCH == "aarch64" {
                "--arm64"
            } else {
                "--x64"
            },
        ],
    )?;

    let built = built_application(&source);
    if !built.exists() {
        return Err(format!(
            "The desktop build was not produced at {}",
            built.display()
        ));
    }
    let destination = app_destination()?;
    let next = destination.with_extension("next");
    let previous = destination.with_extension("previous");
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    emit(
        app,
        "Install",
        "Installing the new application and keeping one rollback copy…",
        88,
    );
    copy_application(&built, &next)?;
    stop_running_application();
    activate_application(&next, &destination, &previous)?;

    #[cfg(target_os = "windows")]
    install_windows_integration(&destination, &release.tag_name)?;

    #[cfg(target_os = "macos")]
    {
        let signed = Command::new("/usr/bin/codesign")
            .args(["--force", "--deep", "--sign", "-"])
            .arg(&destination)
            .status();
        if !signed.is_ok_and(|status| status.success()) {
            return Err(
                "The locally installed macOS application could not be ad-hoc signed".to_string(),
            );
        }
    }

    install_helper()?;
    let installed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let state = InstallState {
        installed_tag: Some(release.tag_name.clone()),
        installed_at: Some(installed_at),
        app_path: Some(destination.display().to_string()),
    };
    fs::write(
        state_path()?,
        serde_json::to_vec_pretty(&state).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    emit(
        app,
        "Complete",
        "LABO AI is ready. Launching the application…",
        100,
    );
    prepare_application_handoff(app)?;
    if let Err(error) = launch_application(&destination) {
        restore_setup_after_handoff_failure(app);
        return Err(error);
    }
    #[cfg(target_os = "windows")]
    schedule_windows_setup_cleanup()?;
    Ok(InstallResult {
        tag: release.tag_name,
        path: destination.display().to_string(),
        setup_relaunched: false,
    })
}

#[tauri::command]
async fn install_latest(app: AppHandle) -> Result<InstallResult, String> {
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || perform_install(&worker_app))
        .await
        .map_err(|error| error.to_string())??;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(50));
        app.exit(0);
    });
    Ok(result)
}

pub fn run() {
    if env::args().any(|argument| argument == "--status") {
        match status()
            .and_then(|value| serde_json::to_string(&value).map_err(|error| error.to_string()))
        {
            Ok(value) => println!("{value}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }

    let automatic_install = env::args().any(|argument| argument == "--auto-install");
    tauri::Builder::default()
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }

            if automatic_install {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(700));
                    if let Err(error) = perform_install(&handle) {
                        emit(&handle, "Failed", error, 100);
                        return;
                    }
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.close();
                    }
                    thread::sleep(Duration::from_millis(50));
                    handle.exit(0);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![setup_status, install_latest])
        .run(tauri::generate_context!())
        .expect("error while running LABO AI Setup");
}

#[cfg(test)]
mod tests {
    use super::{release_is_newer, version_parts};

    #[test]
    fn compares_setup_versions_without_downgrading() {
        assert_eq!(version_parts("v1.4.12"), Some(vec![1, 4, 12]));
        assert!(release_is_newer("v999.0.0"));
        assert!(!release_is_newer(env!("CARGO_PKG_VERSION")));
        assert!(!release_is_newer("v0.0.1"));
    }
}
