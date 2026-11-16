use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::model::ConnectionConfig;

const KEYCHAIN_SERVICE_PREFIX: &str = "com.rill.redis.connection.";

#[derive(Debug, Serialize, Deserialize, Default)]
struct StoreFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    connections: Vec<ConnectionConfig>,
}

pub fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Rill")
}

fn config_path() -> PathBuf {
    data_dir().join("connections.json")
}

pub fn load_connections() -> Vec<ConnectionConfig> {
    let path = config_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    match serde_json::from_str::<StoreFile>(&raw) {
        Ok(mut file) => {
            for c in file.connections.iter_mut() {
                if c.id.is_empty() {
                    c.id = uuid::Uuid::new_v4().to_string();
                }
            }
            file.connections
        }
        Err(err) => {
            eprintln!("[rill] failed to parse connections.json: {err}");
            // Keep a backup of the broken file rather than destroying user data.
            let _ = fs::copy(&path, path.with_extension("json.broken"));
            Vec::new()
        }
    }
}

pub fn save_connections(connections: &[ConnectionConfig]) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));

    let file = StoreFile {
        version: 1,
        connections: connections.to_vec(),
    };
    let raw = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = config_path();
    let tmp = dir.join("connections.json.tmp");
    fs::write(&tmp, raw).map_err(|e| format!("无法写入配置: {e}"))?;
    let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    fs::rename(&tmp, &path).map_err(|e| format!("无法保存配置: {e}"))?;
    Ok(())
}

fn service_name(id: &str) -> String {
    format!("{KEYCHAIN_SERVICE_PREFIX}{id}")
}

pub fn set_secret(id: &str, password: &str) -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-a",
            id,
            "-s",
            &service_name(id),
            "-w",
            password,
        ])
        .output()
        .map_err(|e| format!("无法调用 macOS 钥匙串: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn get_secret(id: &str) -> Option<String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            id,
            "-s",
            &service_name(id),
            "-w",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    Some(raw.trim_end_matches(['\n', '\r']).to_string())
}

pub fn has_secret(id: &str) -> bool {
    get_secret(id).map(|s| !s.is_empty()).unwrap_or(false)
}

pub fn delete_secret(id: &str) {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-a", id, "-s", &service_name(id)])
        .output();
}
