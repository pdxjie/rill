use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use redis::aio::MultiplexedConnection;
use redis::{Client, ConnectionAddr, ConnectionInfo, RedisConnectionInfo, TlsCertificates};
use tokio::task::JoinHandle;

use crate::model::{ConnectionConfig, TestConnectionResult};
use crate::ssh::{self, Tunnel};
use crate::store;

pub struct Session {
    pub cfg: ConnectionConfig,
    pub client: Client,
    pub conn: MultiplexedConnection,
    pub version: String,
    current_db: AtomicI64,
    _tunnel: Mutex<Option<Tunnel>>,
}

impl Session {
    pub fn db(&self) -> i64 {
        self.current_db.load(Ordering::Relaxed)
    }

    /// `SELECT` is connection-scoped: the multiplexed connection is shared by
    /// every command, so switching here changes the whole session at once.
    pub async fn switch_db(&self, db: i64) -> Result<(), String> {
        if db < 0 || db > 255 {
            return Err("数据库编号需要在 0–255 之间".to_string());
        }
        if db == self.db() {
            return Ok(());
        }
        let mut conn = self.conn.clone();
        tokio::time::timeout(
            Duration::from_secs(10),
            redis::cmd("SELECT")
                .arg(db)
                .query_async::<redis::Value>(&mut conn),
        )
        .await
        .map_err(|_| "切换数据库超时".to_string())?
        .map_err(|e| format!("切换数据库失败: {e}"))?;
        self.current_db.store(db, Ordering::Relaxed);
        Ok(())
    }
}

pub struct AppState {
    pub sessions: Mutex<HashMap<String, Arc<Session>>>,
    pub configs: Mutex<Vec<ConnectionConfig>>,
    pub pubsub: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            configs: Mutex::new(store::load_connections()),
            pubsub: Mutex::new(HashMap::new()),
        }
    }

    pub fn session(&self, id: &str) -> Result<Arc<Session>, String> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| "连接尚未建立，请重新连接".to_string())
    }

    pub fn config(&self, id: &str) -> Option<ConnectionConfig> {
        self.configs
            .lock()
            .unwrap()
            .iter()
            .find(|c| c.id == id)
            .cloned()
    }

    pub fn drop_session(&self, id: &str) {
        self.sessions.lock().unwrap().remove(id);
        if let Some(handle) = self.pubsub.lock().unwrap().remove(id) {
            handle.abort();
        }
    }
}

fn build_client(
    cfg: &ConnectionConfig,
    password: Option<String>,
    host: &str,
    port: u16,
) -> Result<Client, String> {
    let addr = if cfg.tls {
        ConnectionAddr::TcpTls {
            host: host.to_string(),
            port,
            insecure: cfg.tls_insecure,
            tls_params: None,
        }
    } else {
        ConnectionAddr::Tcp(host.to_string(), port)
    };
    let info = ConnectionInfo {
        addr,
        redis: RedisConnectionInfo {
            db: cfg.db,
            username: cfg.username.clone().filter(|u| !u.is_empty()),
            password: password.filter(|p| !p.is_empty()),
            protocol: redis::ProtocolVersion::RESP2,
        },
    };
    if cfg.tls {
        Client::build_with_tls(
            info,
            TlsCertificates {
                client_tls: None,
                root_cert: None,
            },
        )
        .map_err(|e| format!("TLS 客户端创建失败: {e}"))
    } else {
        Client::open(info).map_err(|e| format!("连接配置无效: {e}"))
    }
}

fn parse_version(info: &str) -> Option<String> {
    info.lines()
        .find_map(|line| line.strip_prefix("redis_version:"))
        .map(|v| v.trim().to_string())
}

pub async fn open_session(
    cfg: &ConnectionConfig,
    password_override: Option<String>,
) -> Result<(Session, f64), String> {
    let password = match password_override {
        Some(p) => Some(p),
        None => store::get_secret(&cfg.id),
    };

    let mut tunnel = None;
    let (connect_host, connect_port) = if let Some(ssh_cfg) = cfg.ssh.as_ref() {
        let t = ssh::start(ssh_cfg, &cfg.host, cfg.port)?;
        let port = t.local_port;
        tunnel = Some(t);
        ("127.0.0.1".to_string(), port)
    } else {
        (cfg.host.clone(), cfg.port)
    };

    let client = build_client(cfg, password, &connect_host, connect_port)?;
    let started = Instant::now();
    let async_config = redis::AsyncConnectionConfig::new()
        .set_connection_timeout(Duration::from_secs(8))
        .set_response_timeout(Duration::from_secs(30));
    let mut conn = tokio::time::timeout(
        Duration::from_secs(10),
        client.get_multiplexed_async_connection_with_config(&async_config),
    )
    .await
    .map_err(|_| "连接超时（10 秒）：请检查地址、端口、防火墙或 SSH 隧道".to_string())?
    .map_err(|e| format!("连接失败: {e}"))?;

    let pong: String = tokio::time::timeout(
        Duration::from_secs(6),
        redis::cmd("PING").query_async(&mut conn),
    )
    .await
    .map_err(|_| "PING 超时".to_string())?
    .map_err(|e| format!("PING 失败: {e}"))?;

    if pong.to_uppercase() != "PONG" {
        return Err(format!("Redis 返回异常: {pong}"));
    }

    let latency = started.elapsed().as_secs_f64() * 1000.0;
    let version = redis::cmd("INFO")
        .arg("server")
        .query_async::<String>(&mut conn)
        .await
        .ok()
        .and_then(|raw| parse_version(&raw))
        .unwrap_or_else(|| "Redis".to_string());

    Ok((
        Session {
            cfg: cfg.clone(),
            client,
            conn,
            version,
            current_db: AtomicI64::new(cfg.db),
            _tunnel: Mutex::new(tunnel),
        },
        latency,
    ))
}

pub async fn test_connection(
    cfg: &ConnectionConfig,
    password: Option<String>,
) -> TestConnectionResult {
    match open_session(cfg, password).await {
        Ok((session, latency)) => TestConnectionResult {
            ok: true,
            latency_ms: (latency * 10.0).round() / 10.0,
            version: Some(session.version.clone()),
            message: format!("连接成功 · {} ms", (latency * 10.0).round() / 10.0),
        },
        Err(message) => TestConnectionResult {
            ok: false,
            latency_ms: 0.0,
            version: None,
            message,
        },
    }
}

pub fn ensure_writable(session: &Session) -> Result<(), String> {
    if session.cfg.read_only {
        Err("该连接已开启只读保护，写操作被拒绝".to_string())
    } else {
        Ok(())
    }
}
