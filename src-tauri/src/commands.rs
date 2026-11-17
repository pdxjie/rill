use std::io::Write;
use std::process::{Command, Stdio};

use tauri::{AppHandle, State};

use crate::admin;
use crate::console;
use crate::keys;
use crate::model::*;
use crate::pubsub;
use crate::session::{self, AppState, Session};
use crate::store;

fn session_of(state: &AppState, id: &str) -> Result<std::sync::Arc<Session>, String> {
    state.session(id)
}

/// WebView clipboard access can be restricted by the macOS sandbox; write via
/// the native pbcopy binary instead so copy buttons always work.
#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut child = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法访问剪贴板: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("写入剪贴板失败: {e}"))?;
        // Dropping stdin closes the pipe so pbcopy can finish.
    }
    let status = child.wait().map_err(|e| format!("剪贴板进程失败: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("pbcopy 执行失败".to_string())
    }
}

#[tauri::command]
pub fn list_connections(state: State<'_, AppState>) -> Vec<ConnectionView> {
    let sessions = state.sessions.lock().unwrap();
    state
        .configs
        .lock()
        .unwrap()
        .iter()
        .map(|cfg| {
            let connected = sessions.get(&cfg.id).cloned();
            let mut config = cfg.clone();
            if let Some(session) = connected.as_ref() {
                config.db = session.db();
            }
            ConnectionView {
                config,
                connected: connected.is_some(),
                server_version: connected.map(|s| s.version.clone()),
            }
        })
        .collect()
}

#[tauri::command]
pub fn save_connection(
    state: State<'_, AppState>,
    input: SaveConnectionInput,
) -> Result<ConnectionConfig, String> {
    let mut cfg = input.connection.sanitized();
    if cfg.id.trim().is_empty() {
        cfg.id = uuid::Uuid::new_v4().to_string();
        cfg.created_at = now_ms();
    }
    if cfg.created_at == 0 {
        cfg.created_at = now_ms();
    }

    if let Some(password) = input.password.as_ref() {
        if password.is_empty() {
            store::delete_secret(&cfg.id);
            cfg.has_password = false;
        } else {
            store::set_secret(&cfg.id, password)?;
            cfg.has_password = true;
        }
    } else if input.clear_password {
        store::delete_secret(&cfg.id);
        cfg.has_password = false;
    } else {
        cfg.has_password = store::has_secret(&cfg.id);
    }

    {
        let mut configs = state.configs.lock().unwrap();
        if let Some(existing) = configs.iter_mut().find(|c| c.id == cfg.id) {
            *existing = cfg.clone();
        } else {
            configs.push(cfg.clone());
        }
        store::save_connections(&configs)?;
    }

    // Configuration changed: force a fresh connection next time.
    state.drop_session(&cfg.id);
    Ok(cfg)
}

#[tauri::command]
pub fn delete_connection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.drop_session(&id);
    store::delete_secret(&id);
    let mut configs = state.configs.lock().unwrap();
    configs.retain(|c| c.id != id);
    store::save_connections(&configs)
}

#[tauri::command]
pub async fn test_connection(input: TestConnectionInput) -> Result<TestConnectionResult, String> {
    let mut cfg = input.connection.sanitized();
    if cfg.id.is_empty() {
        cfg.id = format!("test-{}", uuid::Uuid::new_v4());
    }
    let result = session::test_connection(&cfg, input.password).await;
    if !result.ok {
        return Ok(result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> Result<ConnectResult, String> {
    if let Ok(existing) = state.session(&id) {
        return Ok(ConnectResult {
            version: existing.version.clone(),
            latency_ms: 0.0,
        });
    }
    let cfg = state.config(&id).ok_or_else(|| "连接不存在".to_string())?;

    let (session, latency_ms) = session::open_session(&cfg, None).await?;
    let version = session.version.clone();
    state
        .sessions
        .lock()
        .unwrap()
        .insert(id.clone(), std::sync::Arc::new(session));

    if let Ok(mut configs) = state.configs.lock() {
        if let Some(c) = configs.iter_mut().find(|c| c.id == id) {
            c.last_used_at = now_ms();
        }
        let _ = store::save_connections(&configs);
    }

    Ok(ConnectResult {
        version,
        latency_ms: (latency_ms * 10.0).round() / 10.0,
    })
}

#[tauri::command]
pub fn disconnect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.drop_session(&id);
    Ok(())
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<DatabaseEntry>, String> {
    let session = session_of(&state, &id)?;
    admin::databases(&session).await
}

#[tauri::command]
pub async fn switch_db(
    state: State<'_, AppState>,
    id: String,
    db: i64,
) -> Result<SwitchDbResult, String> {
    let session = session_of(&state, &id)?;
    session.switch_db(db).await?;

    let mut conn = session.conn.clone();
    let cmd = redis::cmd("DBSIZE");
    // SELECT already succeeded; a denied/slow DBSIZE must not turn a successful
    // database switch into a frontend error.
    let keys: u64 = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        cmd.query_async(&mut conn),
    )
    .await
    .ok()
    .and_then(|result| result.ok())
    .unwrap_or(0);

    if let Ok(mut configs) = state.configs.lock() {
        if let Some(cfg) = configs.iter_mut().find(|c| c.id == id) {
            cfg.db = db;
        }
        let _ = store::save_connections(&configs);
    }

    Ok(SwitchDbResult { db, keys })
}

#[tauri::command]
pub async fn overview(state: State<'_, AppState>, id: String) -> Result<Overview, String> {
    let session = session_of(&state, &id)?;
    admin::overview(&session).await
}

#[tauri::command]
pub async fn scan_keys(
    state: State<'_, AppState>,
    id: String,
    cursor: u64,
    pattern: Option<String>,
    type_filter: Option<String>,
    count: Option<u32>,
) -> Result<ScanPage, String> {
    let session = session_of(&state, &id)?;
    keys::scan_keys(&session, cursor, pattern, type_filter, count.unwrap_or(200)).await
}

#[tauri::command]
pub async fn prefix_keys(
    state: State<'_, AppState>,
    id: String,
    prefix: String,
    cursor: u64,
    count: Option<u32>,
) -> Result<ScanPage, String> {
    let session = session_of(&state, &id)?;
    keys::prefix_keys(&session, &prefix, cursor, count.unwrap_or(200)).await
}

#[tauri::command]
pub async fn namespace_tree(
    state: State<'_, AppState>,
    id: String,
    pattern: Option<String>,
    max_keys: Option<u64>,
    cursor: Option<u64>,
    budget_ms: Option<u64>,
) -> Result<NamespaceTreeResult, String> {
    let session = session_of(&state, &id)?;
    keys::namespace_tree(
        &session,
        pattern,
        max_keys.unwrap_or(100_000),
        cursor.unwrap_or(0),
        budget_ms.unwrap_or(2000),
    )
    .await
}

#[tauri::command]
pub async fn key_detail(
    state: State<'_, AppState>,
    id: String,
    key: String,
    count: Option<u32>,
) -> Result<KeyDetail, String> {
    let session = session_of(&state, &id)?;
    keys::key_detail(&session, &key, count.unwrap_or(100)).await
}

#[tauri::command]
pub async fn key_page(
    state: State<'_, AppState>,
    id: String,
    key: String,
    key_type: String,
    cursor: String,
    count: Option<u32>,
) -> Result<ValueData, String> {
    let session = session_of(&state, &id)?;
    keys::key_page(&session, &key, &key_type, &cursor, count.unwrap_or(100)).await
}

#[tauri::command]
pub async fn set_string(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
    ttl: Option<i64>,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::set_string(&session, &key, &value, ttl).await
}

#[tauri::command]
pub async fn hash_set(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
    value: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::hash_set(&session, &key, &field, &value).await
}

#[tauri::command]
pub async fn hash_del(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::hash_del(&session, &key, &field).await
}

#[tauri::command]
pub async fn list_set(
    state: State<'_, AppState>,
    id: String,
    key: String,
    index: i64,
    value: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::list_set(&session, &key, index, &value).await
}

#[tauri::command]
pub async fn list_push(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
    left: Option<bool>,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::list_push(&session, &key, &value, left.unwrap_or(false)).await
}

#[tauri::command]
pub async fn list_remove(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::list_remove(&session, &key, &value).await
}

#[tauri::command]
pub async fn set_add(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::set_add(&session, &key, &member).await
}

#[tauri::command]
pub async fn set_remove(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::set_remove(&session, &key, &member).await
}

#[tauri::command]
pub async fn zset_add(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
    score: f64,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::zset_add(&session, &key, &member, score).await
}

#[tauri::command]
pub async fn zset_remove(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::zset_remove(&session, &key, &member).await
}

#[tauri::command]
pub async fn create_key(
    state: State<'_, AppState>,
    id: String,
    key: String,
    kind: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::create_key(&session, &key, &kind).await
}

#[tauri::command]
pub async fn delete_key(state: State<'_, AppState>, id: String, key: String) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::delete_key(&session, &key).await
}

#[tauri::command]
pub async fn rename_key(
    state: State<'_, AppState>,
    id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::rename_key(&session, &from, &to).await
}

#[tauri::command]
pub async fn expire_key(
    state: State<'_, AppState>,
    id: String,
    key: String,
    seconds: i64,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::expire_key(&session, &key, seconds).await
}

#[tauri::command]
pub async fn persist_key(
    state: State<'_, AppState>,
    id: String,
    key: String,
) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    keys::persist_key(&session, &key).await
}

#[tauri::command]
pub async fn analyze(
    state: State<'_, AppState>,
    id: String,
    limit: Option<u64>,
) -> Result<AnalysisResult, String> {
    let session = session_of(&state, &id)?;
    keys::analyze(&session, limit.unwrap_or(5000)).await
}

#[tauri::command]
pub async fn execute(
    state: State<'_, AppState>,
    id: String,
    command: String,
) -> Result<ConsoleResult, String> {
    let session = session_of(&state, &id)?;
    console::execute(&session, &command).await
}

#[tauri::command]
pub async fn slowlog(
    state: State<'_, AppState>,
    id: String,
    count: Option<u32>,
) -> Result<Vec<SlowLogEntry>, String> {
    let session = session_of(&state, &id)?;
    admin::slowlog(&session, count.unwrap_or(128)).await
}

#[tauri::command]
pub async fn slowlog_reset(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let session = session_of(&state, &id)?;
    admin::slowlog_reset(&session).await
}

#[tauri::command]
pub async fn clients(state: State<'_, AppState>, id: String) -> Result<Vec<ClientRow>, String> {
    let session = session_of(&state, &id)?;
    admin::clients(&session).await
}

#[tauri::command]
pub async fn pubsub_channels(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    let session = session_of(&state, &id)?;
    pubsub::channels(&session).await
}

#[tauri::command]
pub async fn pubsub_start(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    channels: Vec<String>,
) -> Result<Vec<String>, String> {
    pubsub::subscribe(app, &state, &id, channels).await
}

#[tauri::command]
pub fn pubsub_stop(state: State<'_, AppState>, id: String) {
    pubsub::unsubscribe(&state, &id);
}
