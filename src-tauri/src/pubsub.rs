use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::model::{now_ms, PubSubMessage};
use crate::session::{AppState, Session};

pub async fn channels(session: &Session) -> Result<Vec<String>, String> {
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("PUBSUB");
    cmd.arg("CHANNELS").arg("*");
    let channels: Vec<String> = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        cmd.query_async(&mut conn),
    )
    .await
    .map_err(|_| "读取频道超时".to_string())?
    .map_err(|e| e.to_string())?;
    Ok(channels)
}

pub async fn subscribe(
    app: AppHandle,
    state: &AppState,
    id: &str,
    channels: Vec<String>,
) -> Result<Vec<String>, String> {
    let channels: Vec<String> = channels
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    if channels.is_empty() {
        return Err("请填写至少一个频道名（支持 * 通配符）".to_string());
    }

    if let Some(handle) = state.pubsub.lock().unwrap().remove(id) {
        handle.abort();
    }

    let session = state.session(id)?;
    let mut pubsub = session
        .client
        .get_async_pubsub()
        .await
        .map_err(|e| format!("发布订阅连接失败: {e}"))?;

    let patterned = channels.iter().any(|c| c.contains('*') || c.contains('?'));
    if patterned {
        pubsub
            .psubscribe(channels.clone())
            .await
            .map_err(|e| format!("PSUBSCRIBE 失败: {e}"))?;
    } else {
        pubsub
            .subscribe(channels.clone())
            .await
            .map_err(|e| format!("SUBSCRIBE 失败: {e}"))?;
    }

    let mut stream = pubsub.into_on_message();
    let handle = tokio::spawn(async move {
        while let Some(msg) = stream.next().await {
            let payload = String::from_utf8_lossy(msg.get_payload_bytes()).to_string();
            let pattern = if msg.from_pattern() {
                msg.get_pattern::<String>().ok()
            } else {
                None
            };
            let _ = app.emit(
                "pubsub://message",
                PubSubMessage {
                    channel: msg.get_channel_name().to_string(),
                    payload,
                    pattern,
                    ts: now_ms(),
                },
            );
        }
    });

    state.pubsub.lock().unwrap().insert(id.to_string(), handle);
    Ok(channels)
}

pub fn unsubscribe(state: &AppState, id: &str) {
    if let Some(handle) = state.pubsub.lock().unwrap().remove(id) {
        handle.abort();
    }
}
