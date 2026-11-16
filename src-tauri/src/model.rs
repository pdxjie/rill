use serde::{Deserialize, Serialize};

fn default_port() -> u16 {
    6379
}
fn default_ssh_port() -> u16 {
    22
}
fn default_color() -> String {
    "#FF6B57".to_string()
}
fn default_env() -> String {
    "local".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub key_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub db: i64,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub tls: bool,
    #[serde(default)]
    pub tls_insecure: bool,
    #[serde(default)]
    pub ssh: Option<SshConfig>,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_env")]
    pub env: String,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub has_password: bool,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub last_used_at: i64,
}

fn default_name() -> String {
    "新连接".to_string()
}
fn default_host() -> String {
    "127.0.0.1".to_string()
}

impl ConnectionConfig {
    pub fn sanitized(mut self) -> Self {
        self.name = if self.name.trim().is_empty() {
            if self.host.is_empty() {
                "新连接".into()
            } else {
                format!("{}:{}", self.host, self.port)
            }
        } else {
            self.name.trim().to_string()
        };
        self.host = self.host.trim().to_string();
        self.username = self
            .username
            .take()
            .map(|u| u.trim().to_string())
            .filter(|u| !u.is_empty());
        if self.port == 0 {
            self.port = 6379;
        }
        if let Some(mut ssh) = self.ssh.take() {
            if ssh.host.trim().is_empty() {
                self.ssh = None;
            } else {
                ssh.host = ssh.host.trim().to_string();
                ssh.user = ssh.user.trim().to_string();
                if ssh.port == 0 {
                    ssh.port = 22;
                }
                ssh.key_path = ssh
                    .key_path
                    .take()
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty());
                self.ssh = Some(ssh);
            }
        }
        self
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub connection: ConnectionConfig,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub clear_password: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionInput {
    pub connection: ConnectionConfig,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionView {
    #[serde(flatten)]
    pub config: ConnectionConfig,
    pub connected: bool,
    pub server_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub version: String,
    pub latency_ms: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub latency_ms: f64,
    pub version: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMeta {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceEntry {
    pub path: String,
    pub name: String,
    pub depth: u32,
    pub count: u64,
    pub direct: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceTreeResult {
    pub entries: Vec<NamespaceEntry>,
    pub scanned: u64,
    pub root_keys: u64,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPage {
    pub keys: Vec<KeyMeta>,
    pub cursor: u64,
    pub done: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FieldValue {
    pub field: String,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexedValue {
    pub index: i64,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoredValue {
    pub member: String,
    pub score: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<FieldValue>,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ValueData {
    String {
        text: String,
        bytes: u64,
        truncated: bool,
        binary: bool,
    },
    Hash {
        items: Vec<FieldValue>,
        cursor: u64,
        done: bool,
        total: u64,
    },
    List {
        items: Vec<IndexedValue>,
        next_start: i64,
        done: bool,
        total: u64,
    },
    Set {
        items: Vec<String>,
        cursor: u64,
        done: bool,
        total: u64,
    },
    ZSet {
        items: Vec<ScoredValue>,
        cursor: u64,
        done: bool,
        total: u64,
    },
    Stream {
        entries: Vec<StreamEntry>,
        last_id: String,
        done: bool,
        total: u64,
    },
    Unsupported {
        note: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDetail {
    pub meta: KeyMeta,
    pub encoding: Option<String>,
    pub length: u64,
    pub value: ValueData,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseEntry {
    pub index: i64,
    pub keys: u64,
    pub expires: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchDbResult {
    pub db: i64,
    pub keys: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbInfo {
    pub db: String,
    pub keys: u64,
    pub expires: u64,
    pub avg_ttl: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmdStat {
    pub name: String,
    pub calls: u64,
    pub usec_per_call: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicationInfo {
    pub role: String,
    pub connected_slaves: u64,
    pub master_host: Option<String>,
    pub master_port: Option<u64>,
    pub master_link_status: Option<String>,
    pub repl_offset: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InfoItem {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InfoSection {
    pub name: String,
    pub items: Vec<InfoItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub version: String,
    pub mode: String,
    pub role: String,
    pub os: String,
    pub uptime_secs: u64,
    pub connected_clients: u64,
    pub used_memory: u64,
    pub used_memory_peak: u64,
    pub max_memory: u64,
    pub maxmemory_policy: String,
    pub mem_fragmentation_ratio: f64,
    pub total_connections_received: u64,
    pub total_commands_processed: u64,
    pub ops_per_sec: u64,
    pub keyspace_hits: u64,
    pub keyspace_misses: u64,
    pub expired_keys: u64,
    pub evicted_keys: u64,
    pub rejected_connections: u64,
    pub net_input_bytes: u64,
    pub net_output_bytes: u64,
    pub rdb_last_save_time: u64,
    pub aof_enabled: bool,
    pub dbsize: u64,
    pub dbs: Vec<DbInfo>,
    pub slowlog_len: u64,
    pub hit_rate: f64,
    pub top_commands: Vec<CmdStat>,
    pub replication: ReplicationInfo,
    pub sections: Vec<InfoSection>,
    pub sampled_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientRow {
    pub id: String,
    pub addr: String,
    pub name: String,
    pub age: u64,
    pub idle: u64,
    pub db: i64,
    pub cmd: String,
    pub user: String,
    pub flags: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlowLogEntry {
    pub id: i64,
    pub timestamp: i64,
    pub duration_us: i64,
    pub args: Vec<String>,
    pub client: String,
    pub client_name: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConsoleValue {
    Nil,
    Int {
        value: i64,
    },
    Status {
        value: String,
    },
    Bulk {
        value: String,
        bytes: usize,
        binary: bool,
    },
    Array {
        value: Vec<ConsoleValue>,
    },
    Map {
        value: Vec<(ConsoleValue, ConsoleValue)>,
    },
    Double {
        value: f64,
    },
    Bool {
        value: bool,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleResult {
    pub command: String,
    pub elapsed_ms: f64,
    pub value: ConsoleValue,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PubSubMessage {
    pub channel: String,
    pub payload: String,
    pub pattern: Option<String>,
    pub ts: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMemory {
    pub key: String,
    pub key_type: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefixMemory {
    pub prefix: String,
    pub bytes: u64,
    pub keys: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub scanned: u64,
    pub total_bytes: u64,
    pub top_keys: Vec<KeyMemory>,
    pub prefixes: Vec<PrefixMemory>,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
