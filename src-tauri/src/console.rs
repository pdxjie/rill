use std::time::Instant;

use redis::Value;

use crate::model::{ConsoleResult, ConsoleValue};
use crate::session::Session;

const BLOCKED: &[&str] = &[
    "MONITOR",
    "SUBSCRIBE",
    "PSUBSCRIBE",
    "SSUBSCRIBE",
    "SYNC",
    "PSYNC",
    "SHUTDOWN",
    "QUIT",
    "SELECT",
    "SWAPDB",
    "DEBUG",
    "REPLICAOF",
    "SLAVEOF",
    "MIGRATE",
    "BLPOP",
    "BRPOP",
    "BLMOVE",
    "BRPOPLPUSH",
    "BZPOPMIN",
    "BZPOPMAX",
    "BLMPOP",
    "BZMPOP",
    "WAIT",
    "WAITAOF",
    "XREAD",
];

const READ_ONLY: &[&str] = &[
    "PING",
    "ECHO",
    "INFO",
    "DBSIZE",
    "TYPE",
    "EXISTS",
    "TTL",
    "PTTL",
    "EXPIRETIME",
    "PEXPIRETIME",
    "GET",
    "MGET",
    "STRLEN",
    "GETRANGE",
    "SUBSTR",
    "GETBIT",
    "BITCOUNT",
    "BITPOS",
    "SCAN",
    "KEYS",
    "RANDOMKEY",
    "HSCAN",
    "HGET",
    "HMGET",
    "HGETALL",
    "HLEN",
    "HEXISTS",
    "HKEYS",
    "HVALS",
    "HRANDFIELD",
    "SSCAN",
    "SMEMBERS",
    "SCARD",
    "SISMEMBER",
    "SMISMEMBER",
    "SRANDMEMBER",
    "ZSCAN",
    "ZRANGE",
    "ZREVRANGE",
    "ZRANGEBYSCORE",
    "ZREVRANGEBYSCORE",
    "ZRANGEBYLEX",
    "ZREVRANGEBYLEX",
    "ZCARD",
    "ZSCORE",
    "ZMSCORE",
    "ZCOUNT",
    "ZRANK",
    "ZREVRANK",
    "ZRANDMEMBER",
    "XRANGE",
    "XREVRANGE",
    "XLEN",
    "OBJECT",
    "DUMP",
    "TIME",
    "LOLWUT",
    "GEOPOS",
    "GEODIST",
    "GEOHASH",
    "GEORADIUS_RO",
    "GEOSEARCH",
];

fn is_read_only(args: &[String]) -> bool {
    let Some(cmd) = args.first() else {
        return false;
    };
    let cmd = cmd.to_uppercase();
    let sub = args.get(1).map(|s| s.to_uppercase()).unwrap_or_default();
    match cmd.as_str() {
        "CONFIG" => sub == "GET",
        "CLIENT" => matches!(sub.as_str(), "LIST" | "INFO" | "GETNAME" | "ID"),
        "ACL" => matches!(sub.as_str(), "WHOAMI" | "LIST" | "CAT" | "GETUSER"),
        "MEMORY" => matches!(sub.as_str(), "USAGE" | "STATS" | "DOCTOR"),
        "SLOWLOG" => sub != "RESET",
        "LATENCY" => sub != "RESET" && sub != "HISTORY",
        "PUBSUB" => true,
        "COMMAND" => true,
        "XINFO" => true,
        _ => READ_ONLY.contains(&cmd.as_str()),
    }
}

fn tokenize(input: &str) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut chars = input.chars().peekable();
    let mut has_token = false;

    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            } else if c == '\\' && q == '"' {
                if let Some(next) = chars.next() {
                    cur.push(next);
                }
            } else {
                cur.push(c);
            }
            continue;
        }
        match c {
            '\'' | '"' => {
                quote = Some(c);
                has_token = true;
            }
            '\\' => {
                if let Some(next) = chars.next() {
                    cur.push(next);
                    has_token = true;
                }
            }
            c if c.is_whitespace() => {
                if has_token {
                    out.push(std::mem::take(&mut cur));
                    has_token = false;
                }
            }
            c => {
                cur.push(c);
                has_token = true;
            }
        }
    }

    if let Some(q) = quote {
        return Err(format!("引号未闭合：{q}"));
    }
    if has_token {
        out.push(cur);
    }
    if out.is_empty() {
        return Err("请输入命令".to_string());
    }
    Ok(out)
}

fn convert(value: Value) -> ConsoleValue {
    match value {
        Value::Nil => ConsoleValue::Nil,
        Value::Int(i) => ConsoleValue::Int { value: i },
        Value::SimpleString(s) => ConsoleValue::Status { value: s },
        Value::Okay => ConsoleValue::Status {
            value: "OK".to_string(),
        },
        Value::BulkString(bytes) => ConsoleValue::Bulk {
            value: String::from_utf8_lossy(&bytes).to_string(),
            bytes: bytes.len(),
            binary: std::str::from_utf8(&bytes).is_err(),
        },
        Value::Array(items) => ConsoleValue::Array {
            value: items.into_iter().map(convert).collect(),
        },
        Value::Set(items) => ConsoleValue::Array {
            value: items.into_iter().map(convert).collect(),
        },
        Value::Map(pairs) => ConsoleValue::Map {
            value: pairs
                .into_iter()
                .map(|(k, v)| (convert(k), convert(v)))
                .collect(),
        },
        Value::Attribute { data, .. } => convert(*data),
        Value::Push { data, .. } => ConsoleValue::Array {
            value: data.into_iter().map(convert).collect(),
        },
        Value::Double(f) => ConsoleValue::Double { value: f },
        Value::Boolean(b) => ConsoleValue::Bool { value: b },
        Value::VerbatimString { text, .. } => ConsoleValue::Bulk {
            value: text.clone(),
            bytes: text.len(),
            binary: false,
        },
        Value::BigNumber(n) => ConsoleValue::Status {
            value: n.to_string(),
        },
        Value::ServerError(e) => ConsoleValue::Status {
            value: format!("{e:?}"),
        },
    }
}

pub async fn execute(session: &Session, line: &str) -> Result<ConsoleResult, String> {
    let args = tokenize(line)?;
    let cmd_name = args[0].to_uppercase();

    if cmd_name == "KEYS" {
        return Err(
            "KEYS 会遍历整个数据库并可能阻塞 Redis，Rill 已禁用它。请使用键空间的模糊筛选（SCAN）或 SCAN 命令。"
                .to_string(),
        );
    }
    if BLOCKED.contains(&cmd_name.as_str()) {
        return Err(format!(
            "{} 是阻塞或破坏连接状态的命令，Rill 的控制台无法执行。请使用专用面板或 redis-cli。",
            cmd_name
        ));
    }
    if session.cfg.read_only && !is_read_only(&args) {
        return Err(format!("只读保护已开启，{cmd_name} 被视为写命令并被拒绝"));
    }
    if cmd_name == "CLIENT"
        && args
            .get(1)
            .map(|s| s.to_uppercase())
            .as_deref()
            .is_some_and(|s| s == "REPLY")
    {
        return Err("CLIENT REPLY 会破坏连接，已禁用".to_string());
    }

    let mut cmd = redis::cmd(&args[0]);
    for arg in args.iter().skip(1) {
        cmd.arg(arg);
    }
    let mut conn = session.conn.clone();
    let started = Instant::now();
    let value: Value = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        cmd.query_async(&mut conn),
    )
    .await
    .map_err(|_| "命令执行超时（30 秒）".to_string())?
    .map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;

    Ok(ConsoleResult {
        command: line.trim().to_string(),
        elapsed_ms: (elapsed_ms * 100.0).round() / 100.0,
        value: convert(value),
    })
}
