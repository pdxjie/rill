use std::time::Duration;

use redis::aio::MultiplexedConnection;
use redis::{from_redis_value, FromRedisValue, Value};

use crate::model::{
    AnalysisResult, FieldValue, IndexedValue, KeyDetail, KeyMemory, KeyMeta, NamespaceEntry,
    NamespaceTreeResult, PrefixMemory, ScanPage, ScoredValue, StreamEntry, ValueData,
};
use crate::session::{ensure_writable, Session};

const STRING_LIMIT: u64 = 512 * 1024;

async fn q<T: FromRedisValue>(
    conn: &mut MultiplexedConnection,
    cmd: redis::Cmd,
) -> Result<T, String> {
    tokio::time::timeout(Duration::from_secs(25), cmd.query_async(conn))
        .await
        .map_err(|_| "Redis 响应超时（25 秒）".to_string())?
        .map_err(|e| e.to_string())
}

async fn q_pipe(
    conn: &mut MultiplexedConnection,
    pipe: redis::Pipeline,
) -> Result<Vec<Value>, String> {
    tokio::time::timeout(Duration::from_secs(25), pipe.query_async(conn))
        .await
        .map_err(|_| "Redis 响应超时（25 秒）".to_string())?
        .map_err(|e| e.to_string())
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::Int(i) => i.to_string(),
        Value::Double(f) => f.to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::Nil => String::new(),
        other => from_redis_value::<String>(other).unwrap_or_default(),
    }
}

async fn enrich(conn: &mut MultiplexedConnection, keys: &[String]) -> Result<Vec<KeyMeta>, String> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let mut pipe = redis::pipe();
    for key in keys {
        pipe.cmd("TYPE").arg(key).cmd("PTTL").arg(key);
    }
    let values = q_pipe(conn, pipe).await?;
    let mut metas = Vec::with_capacity(keys.len());
    for (i, key) in keys.iter().enumerate() {
        let key_type = values
            .get(i * 2)
            .map(value_to_string)
            .unwrap_or_else(|| "unknown".to_string());
        let pttl = values
            .get(i * 2 + 1)
            .and_then(|v| from_redis_value::<i64>(v).ok())
            .unwrap_or(-1);
        metas.push(KeyMeta {
            key: key.clone(),
            key_type,
            ttl: if pttl < 0 { -1 } else { (pttl + 999) / 1000 },
            size: None,
        });
    }
    Ok(metas)
}

pub async fn scan_keys(
    session: &Session,
    cursor: u64,
    pattern: Option<String>,
    type_filter: Option<String>,
    count: u32,
) -> Result<ScanPage, String> {
    let mut conn = session.conn.clone();
    let pattern = pattern
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "*");
    let type_filter = type_filter
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "all");

    let mut cursor = cursor;
    let mut collected: Vec<String> = Vec::new();
    let mut rounds = 0;
    let done;
    loop {
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(cursor).arg("COUNT").arg(count.clamp(10, 1000));
        if let Some(value) = pattern.as_ref() {
            cmd.arg("MATCH").arg(value);
        }
        let (next, keys): (u64, Vec<String>) = q(&mut conn, cmd).await?;
        collected.extend(keys);
        cursor = next;
        rounds += 1;
        if cursor == 0 {
            done = true;
            break;
        }
        // SCAN may legitimately return empty batches for sparse MATCH patterns.
        // Keep scanning a little so the UI does not look empty on the first page.
        if !collected.is_empty() || rounds >= 8 {
            done = false;
            break;
        }
    }

    let mut metas = enrich(&mut conn, &collected).await?;
    // Type filtering is done client-side so the app also works on Redis 5,
    // where SCAN does not support the TYPE option.
    if let Some(kind) = type_filter.as_ref() {
        metas.retain(|item| item.key_type == *kind);
    }
    Ok(ScanPage {
        keys: metas,
        cursor,
        done,
    })
}

pub async fn prefix_keys(
    session: &Session,
    prefix: &str,
    cursor: u64,
    count: u32,
) -> Result<ScanPage, String> {
    use std::collections::HashSet;
    use std::time::Instant;

    let prefix = prefix.trim();
    if prefix.is_empty() {
        return Err("命名空间前缀不能为空".to_string());
    }
    let target_depth = prefix.split(':').filter(|part| !part.is_empty()).count() + 1;
    let count = count.clamp(1, 500);
    let escaped_prefix = prefix
        .replace('\\', "\\\\")
        .replace('*', "\\*")
        .replace('?', "\\?")
        .replace('[', "\\[")
        .replace(']', "\\]");
    let pattern = format!("{escaped_prefix}:*");

    let mut conn = session.conn.clone();
    let mut current = cursor;
    let mut collected: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let deadline = Instant::now() + Duration::from_secs(8);
    let done;
    loop {
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(current)
            .arg("COUNT")
            .arg(1000)
            .arg("MATCH")
            .arg(&pattern);
        let (next, keys): (u64, Vec<String>) = q(&mut conn, cmd).await?;
        for key in keys {
            // Only direct children belong to this tree level. Deeper keys live
            // under their own folder and must not consume this page.
            if key.split(':').filter(|part| !part.is_empty()).count() == target_depth
                && seen.insert(key.clone())
            {
                collected.push(key);
            }
        }
        current = next;
        if current == 0 {
            done = true;
            break;
        }
        if collected.len() >= count as usize || Instant::now() >= deadline {
            done = false;
            break;
        }
    }

    let metas = enrich(&mut conn, &collected).await?;
    Ok(ScanPage {
        keys: metas,
        cursor: current,
        done,
    })
}

pub async fn namespace_tree(
    session: &Session,
    pattern: Option<String>,
    max_keys: u64,
) -> Result<NamespaceTreeResult, String> {
    use std::time::Instant;

    let mut conn = session.conn.clone();
    let pattern = pattern
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "*");
    let max_keys = max_keys.clamp(10_000, 2_000_000);
    let deadline = Instant::now() + Duration::from_secs(8);

    let mut cursor: u64 = 0;
    let mut scanned: u64 = 0;
    let mut root_keys: u64 = 0;
    let mut counts: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    let mut direct_counts: std::collections::HashMap<String, u64> =
        std::collections::HashMap::new();

    loop {
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(cursor).arg("COUNT").arg(2000);
        if let Some(value) = pattern.as_ref() {
            cmd.arg("MATCH").arg(value);
        }
        let (next, keys): (u64, Vec<String>) = q(&mut conn, cmd).await?;
        scanned += keys.len() as u64;

        for key in &keys {
            let bytes = key.as_bytes();
            let mut has_prefix = false;
            let mut last_separator: Option<usize> = None;
            for (index, byte) in bytes.iter().enumerate() {
                if *byte == b':' && index > 0 && index + 1 < bytes.len() {
                    let path = &key[..index];
                    if !path.is_empty() && !path.ends_with(':') {
                        *counts.entry(path.to_string()).or_insert(0) += 1;
                        has_prefix = true;
                        last_separator = Some(index);
                    }
                }
            }
            if let Some(index) = last_separator {
                // Key directly below its parent namespace, e.g. user:1:profile.
                let parent = &key[..index];
                if !parent.is_empty() && !parent.ends_with(':') {
                    *direct_counts.entry(parent.to_string()).or_insert(0) += 1;
                }
            } else if !has_prefix {
                root_keys += 1;
            }
        }

        cursor = next;
        if cursor == 0 || scanned >= max_keys || Instant::now() >= deadline {
            break;
        }
    }

    let mut entries: Vec<NamespaceEntry> = counts
        .into_iter()
        .map(|(path, count)| {
            let name = path
                .rsplit(':')
                .next()
                .unwrap_or(path.as_str())
                .to_string();
            let depth = path.matches(':').count() as u32 + 1;
            let direct = direct_counts.get(&path).copied().unwrap_or(0);
            NamespaceEntry {
                path,
                name,
                depth,
                count,
                direct,
            }
        })
        .collect();
    entries.sort_by(|a, b| a.path.cmp(&b.path));

    let mut truncated = cursor != 0 || scanned >= max_keys || Instant::now() >= deadline;
    if entries.len() > 8000 {
        entries.truncate(8000);
        truncated = true;
    }

    Ok(NamespaceTreeResult {
        entries,
        scanned,
        root_keys,
        truncated,
    })
}

async fn string_value(conn: &mut MultiplexedConnection, key: &str) -> Result<ValueData, String> {
    let mut len_cmd = redis::cmd("STRLEN");
    len_cmd.arg(key);
    let len: u64 = q(conn, len_cmd).await.unwrap_or(0);

    let bytes: Vec<u8> = if len > STRING_LIMIT {
        let mut cmd = redis::cmd("GETRANGE");
        cmd.arg(key).arg(0).arg(STRING_LIMIT.saturating_sub(1));
        q(conn, cmd).await?
    } else {
        let mut cmd = redis::cmd("GET");
        cmd.arg(key);
        q::<Option<Vec<u8>>>(conn, cmd).await?.unwrap_or_default()
    };

    let binary = std::str::from_utf8(&bytes).is_err();
    Ok(ValueData::String {
        text: String::from_utf8_lossy(&bytes).to_string(),
        bytes: len,
        truncated: len > STRING_LIMIT,
        binary,
    })
}

async fn hash_page(
    conn: &mut MultiplexedConnection,
    key: &str,
    cursor: u64,
    count: u32,
) -> Result<ValueData, String> {
    let mut total_cmd = redis::cmd("HLEN");
    total_cmd.arg(key);
    let total: u64 = q(conn, total_cmd).await.unwrap_or(0);
    let mut cmd = redis::cmd("HSCAN");
    cmd.arg(key).arg(cursor).arg("COUNT").arg(count);
    let (next, flat): (u64, Vec<String>) = q(conn, cmd).await?;
    let items = flat
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| FieldValue {
            field: c[0].clone(),
            value: c[1].clone(),
        })
        .collect();
    Ok(ValueData::Hash {
        items,
        cursor: next,
        done: next == 0,
        total,
    })
}

async fn list_page(
    conn: &mut MultiplexedConnection,
    key: &str,
    start: i64,
    count: u32,
) -> Result<ValueData, String> {
    let mut total_cmd = redis::cmd("LLEN");
    total_cmd.arg(key);
    let total: u64 = q(conn, total_cmd).await.unwrap_or(0);
    let mut cmd = redis::cmd("LRANGE");
    cmd.arg(key).arg(start).arg(start + count as i64 - 1);
    let values: Vec<String> = q(conn, cmd).await?;
    let items = values
        .into_iter()
        .enumerate()
        .map(|(i, value)| IndexedValue {
            index: start + i as i64,
            value,
        })
        .collect::<Vec<_>>();
    let next_start = start + items.len() as i64;
    Ok(ValueData::List {
        items,
        next_start,
        done: next_start >= total as i64,
        total,
    })
}

async fn set_page(
    conn: &mut MultiplexedConnection,
    key: &str,
    cursor: u64,
    count: u32,
) -> Result<ValueData, String> {
    let mut total_cmd = redis::cmd("SCARD");
    total_cmd.arg(key);
    let total: u64 = q(conn, total_cmd).await.unwrap_or(0);
    let mut cmd = redis::cmd("SSCAN");
    cmd.arg(key).arg(cursor).arg("COUNT").arg(count);
    let (next, items): (u64, Vec<String>) = q(conn, cmd).await?;
    Ok(ValueData::Set {
        items,
        cursor: next,
        done: next == 0,
        total,
    })
}

async fn zset_page(
    conn: &mut MultiplexedConnection,
    key: &str,
    cursor: u64,
    count: u32,
) -> Result<ValueData, String> {
    let mut total_cmd = redis::cmd("ZCARD");
    total_cmd.arg(key);
    let total: u64 = q(conn, total_cmd).await.unwrap_or(0);
    let mut cmd = redis::cmd("ZSCAN");
    cmd.arg(key).arg(cursor).arg("COUNT").arg(count);
    let (next, flat): (u64, Vec<String>) = q(conn, cmd).await?;
    let items = flat
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| ScoredValue {
            member: c[0].clone(),
            score: c[1].parse::<f64>().unwrap_or(0.0),
        })
        .collect();
    Ok(ValueData::ZSet {
        items,
        cursor: next,
        done: next == 0,
        total,
    })
}

fn parse_stream_entries(raw: Value) -> Vec<StreamEntry> {
    let mut out = Vec::new();
    if let Value::Array(entries) = raw {
        for entry in entries {
            if let Value::Array(mut parts) = entry {
                if parts.len() < 2 {
                    continue;
                }
                let fields_val = parts.pop().unwrap_or(Value::Nil);
                let id = parts.first().map(value_to_string).unwrap_or_default();
                let mut fields = Vec::new();
                if let Value::Array(flat) = fields_val {
                    let strings: Vec<String> = flat.iter().map(value_to_string).collect();
                    for pair in strings.chunks(2) {
                        if pair.len() == 2 {
                            fields.push(FieldValue {
                                field: pair[0].clone(),
                                value: pair[1].clone(),
                            });
                        }
                    }
                }
                out.push(StreamEntry { id, fields });
            }
        }
    }
    out
}

async fn stream_page(
    conn: &mut MultiplexedConnection,
    key: &str,
    start: &str,
    count: u32,
) -> Result<ValueData, String> {
    let mut total_cmd = redis::cmd("XLEN");
    total_cmd.arg(key);
    let total: u64 = q(conn, total_cmd).await.unwrap_or(0);
    let range_start = if start.is_empty() || start == "0" {
        "-".to_string()
    } else {
        format!("({start}")
    };
    let mut cmd = redis::cmd("XRANGE");
    cmd.arg(key)
        .arg(range_start)
        .arg("+")
        .arg("COUNT")
        .arg(count);
    let raw: Value = q(conn, cmd).await?;
    let entries = parse_stream_entries(raw);
    let last_id = entries
        .last()
        .map(|e| e.id.clone())
        .unwrap_or_else(|| start.to_string());
    let done = entries.len() < count as usize;
    Ok(ValueData::Stream {
        entries,
        last_id,
        done,
        total,
    })
}

async fn fetch_value(
    conn: &mut MultiplexedConnection,
    key: &str,
    key_type: &str,
    cursor: &str,
    count: u32,
) -> Result<ValueData, String> {
    match key_type {
        "string" => string_value(conn, key).await,
        "hash" => {
            let c = cursor.parse::<u64>().unwrap_or(0);
            hash_page(conn, key, c, count).await
        }
        "list" => {
            let start = cursor.parse::<i64>().unwrap_or(0);
            list_page(conn, key, start, count).await
        }
        "set" => {
            let c = cursor.parse::<u64>().unwrap_or(0);
            set_page(conn, key, c, count).await
        }
        "zset" => {
            let c = cursor.parse::<u64>().unwrap_or(0);
            zset_page(conn, key, c, count).await
        }
        "stream" => stream_page(conn, key, cursor, count).await,
        other => Ok(ValueData::Unsupported {
            note: format!("暂不支持直接查看 {other} 类型，请在控制台中使用命令操作"),
        }),
    }
}

pub async fn key_detail(session: &Session, key: &str, count: u32) -> Result<KeyDetail, String> {
    let mut conn = session.conn.clone();
    let mut type_cmd = redis::cmd("TYPE");
    type_cmd.arg(key);
    let key_type: String = q(&mut conn, type_cmd).await?;
    if key_type == "none" {
        return Err("Key 不存在或已过期".to_string());
    }

    let mut ttl_cmd = redis::cmd("TTL");
    ttl_cmd.arg(key);
    let ttl: i64 = q(&mut conn, ttl_cmd).await.unwrap_or(-1);

    let mut enc_cmd = redis::cmd("OBJECT");
    enc_cmd.arg("ENCODING").arg(key);
    let encoding: Option<String> = q(&mut conn, enc_cmd).await.ok();

    let mut mem_cmd = redis::cmd("MEMORY");
    mem_cmd.arg("USAGE").arg(key).arg("SAMPLES").arg(5);
    let size: Option<u64> = q(&mut conn, mem_cmd).await.ok();

    let mut len_cmd = redis::cmd(match key_type.as_str() {
        "string" => "STRLEN",
        "hash" => "HLEN",
        "list" => "LLEN",
        "set" => "SCARD",
        "zset" => "ZCARD",
        "stream" => "XLEN",
        _ => "STRLEN",
    });
    len_cmd.arg(key);
    let length: u64 = q(&mut conn, len_cmd).await.unwrap_or(0);

    let value = fetch_value(&mut conn, key, &key_type, "0", count.max(20)).await?;

    Ok(KeyDetail {
        meta: KeyMeta {
            key: key.to_string(),
            key_type,
            ttl,
            size,
        },
        encoding,
        length,
        value,
    })
}

pub async fn key_page(
    session: &Session,
    key: &str,
    key_type: &str,
    cursor: &str,
    count: u32,
) -> Result<ValueData, String> {
    let mut conn = session.conn.clone();
    fetch_value(&mut conn, key, key_type, cursor, count.clamp(10, 500)).await
}

pub async fn set_string(
    session: &Session,
    key: &str,
    value: &str,
    ttl: Option<i64>,
) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("SET");
    cmd.arg(key).arg(value);
    match ttl {
        Some(sec) if sec > 0 => {
            cmd.arg("EX").arg(sec);
        }
        Some(_) => {
            cmd.arg("KEEPTTL");
        }
        None => {
            cmd.arg("KEEPTTL");
        }
    }
    let _: Value = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn hash_set(
    session: &Session,
    key: &str,
    field: &str,
    value: &str,
) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("HSET");
    cmd.arg(key).arg(field).arg(value);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn hash_del(session: &Session, key: &str, field: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("HDEL");
    cmd.arg(key).arg(field);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn list_set(session: &Session, key: &str, index: i64, value: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("LSET");
    cmd.arg(key).arg(index).arg(value);
    let _: Value = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn list_push(
    session: &Session,
    key: &str,
    value: &str,
    left: bool,
) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd(if left { "LPUSH" } else { "RPUSH" });
    cmd.arg(key).arg(value);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn list_remove(session: &Session, key: &str, value: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("LREM");
    cmd.arg(key).arg(1).arg(value);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn set_add(session: &Session, key: &str, member: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("SADD");
    cmd.arg(key).arg(member);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn set_remove(session: &Session, key: &str, member: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("SREM");
    cmd.arg(key).arg(member);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn zset_add(
    session: &Session,
    key: &str,
    member: &str,
    score: f64,
) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("ZADD");
    cmd.arg(key).arg(score).arg(member);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn zset_remove(session: &Session, key: &str, member: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("ZREM");
    cmd.arg(key).arg(member);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn create_key(session: &Session, key: &str, kind: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut exists = redis::cmd("EXISTS");
    exists.arg(key);
    let n: i64 = q(&mut conn, exists).await?;
    if n > 0 {
        return Err("Key 已存在".to_string());
    }
    match kind {
        "string" => {
            let mut c = redis::cmd("SET");
            c.arg(key).arg("");
            let _: Value = q(&mut conn, c).await?;
        }
        "hash" => {
            let mut c = redis::cmd("HSET");
            c.arg(key).arg("field").arg("");
            let _: i64 = q(&mut conn, c).await?;
        }
        "list" => {
            let mut c = redis::cmd("RPUSH");
            c.arg(key).arg("value");
            let _: i64 = q(&mut conn, c).await?;
        }
        "set" => {
            let mut c = redis::cmd("SADD");
            c.arg(key).arg("value");
            let _: i64 = q(&mut conn, c).await?;
        }
        "zset" => {
            let mut c = redis::cmd("ZADD");
            c.arg(key).arg(0).arg("member");
            let _: i64 = q(&mut conn, c).await?;
        }
        "stream" => {
            let mut c = redis::cmd("XADD");
            c.arg(key).arg("*").arg("field").arg("");
            let _: String = q(&mut conn, c).await?;
        }
        _ => return Err("未知的 Key 类型".to_string()),
    }
    Ok(())
}

pub async fn delete_key(session: &Session, key: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("DEL");
    cmd.arg(key);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn rename_key(session: &Session, from: &str, to: &str) -> Result<(), String> {
    ensure_writable(session)?;
    if from == to {
        return Ok(());
    }
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("RENAME");
    cmd.arg(from).arg(to);
    let _: Value = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn expire_key(session: &Session, key: &str, seconds: i64) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("EXPIRE");
    cmd.arg(key).arg(seconds);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn persist_key(session: &Session, key: &str) -> Result<(), String> {
    ensure_writable(session)?;
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("PERSIST");
    cmd.arg(key);
    let _: i64 = q(&mut conn, cmd).await?;
    Ok(())
}

pub async fn analyze(session: &Session, limit: u64) -> Result<AnalysisResult, String> {
    let mut conn = session.conn.clone();
    let limit = limit.clamp(100, 50_000);
    let mut cursor: u64 = 0;
    let mut scanned: u64 = 0;
    let mut all: Vec<(String, String, u64)> = Vec::new();

    loop {
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(cursor).arg("COUNT").arg(500);
        let (next, keys): (u64, Vec<String>) = q(&mut conn, cmd).await?;
        scanned += keys.len() as u64;

        for chunk in keys.chunks(80) {
            let mut pipe = redis::pipe();
            for key in chunk {
                pipe.cmd("TYPE").arg(key);
                pipe.cmd("MEMORY")
                    .arg("USAGE")
                    .arg(key)
                    .arg("SAMPLES")
                    .arg(3);
            }
            let values = q_pipe(&mut conn, pipe).await?;
            for (i, key) in chunk.iter().enumerate() {
                let key_type = values
                    .get(i * 2)
                    .map(value_to_string)
                    .unwrap_or_else(|| "unknown".into());
                let bytes = values
                    .get(i * 2 + 1)
                    .and_then(|v| from_redis_value::<u64>(v).ok())
                    .unwrap_or(0);
                all.push((key.clone(), key_type, bytes));
            }
        }

        cursor = next;
        if cursor == 0 || scanned >= limit {
            break;
        }
    }

    let total_bytes: u64 = all.iter().map(|(_, _, b)| *b).sum();
    let mut top_keys: Vec<KeyMemory> = all
        .iter()
        .map(|(k, t, b)| KeyMemory {
            key: k.clone(),
            key_type: t.clone(),
            bytes: *b,
        })
        .collect();
    top_keys.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    top_keys.truncate(15);

    let mut map: std::collections::HashMap<String, (u64, u64)> = std::collections::HashMap::new();
    for (key, _, bytes) in &all {
        let prefix = key
            .split_once(':')
            .map(|(p, _)| p.to_string())
            .unwrap_or_else(|| "(无前缀)".to_string());
        let entry = map.entry(prefix).or_insert((0, 0));
        entry.0 += *bytes;
        entry.1 += 1;
    }
    let mut prefixes: Vec<PrefixMemory> = map
        .into_iter()
        .map(|(prefix, (bytes, keys))| PrefixMemory {
            prefix,
            bytes,
            keys,
        })
        .collect();
    prefixes.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    prefixes.truncate(12);

    Ok(AnalysisResult {
        scanned,
        total_bytes,
        top_keys,
        prefixes,
    })
}
