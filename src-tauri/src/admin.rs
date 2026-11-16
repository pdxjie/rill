use std::collections::HashMap;

use redis::Value;

use crate::model::{
    now_ms, ClientRow, CmdStat, DatabaseEntry, DbInfo, InfoItem, InfoSection, Overview,
    ReplicationInfo, SlowLogEntry,
};
use crate::session::Session;

const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

async fn query<T: redis::FromRedisValue>(
    conn: &mut redis::aio::MultiplexedConnection,
    cmd: redis::Cmd,
) -> Result<T, String> {
    tokio::time::timeout(TIMEOUT, cmd.query_async(conn))
        .await
        .map_err(|_| "Redis 响应超时".to_string())?
        .map_err(|e| e.to_string())
}

fn parse_info(raw: &str) -> (Vec<InfoSection>, HashMap<String, String>) {
    let mut sections: Vec<InfoSection> = Vec::new();
    let mut flat: HashMap<String, String> = HashMap::new();
    let mut current: Option<InfoSection> = None;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.strip_prefix('#') {
            if let Some(section) = current.take() {
                sections.push(section);
            }
            current = Some(InfoSection {
                name: name.trim().to_string(),
                items: Vec::new(),
            });
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            if current.is_none() {
                current = Some(InfoSection {
                    name: "General".into(),
                    items: Vec::new(),
                });
            }
            if let Some(section) = current.as_mut() {
                section.items.push(InfoItem {
                    key: key.clone(),
                    value: value.clone(),
                });
            }
            flat.insert(key, value);
        }
    }
    if let Some(section) = current.take() {
        sections.push(section);
    }
    (sections, flat)
}

fn get_u64(map: &HashMap<String, String>, key: &str) -> u64 {
    map.get(key)
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0)
}

fn get_str(map: &HashMap<String, String>, key: &str) -> String {
    map.get(key).cloned().unwrap_or_default()
}

fn parse_dbs(map: &HashMap<String, String>) -> Vec<DbInfo> {
    let mut dbs = Vec::new();
    for (key, value) in map {
        if !key.starts_with("db") {
            continue;
        }
        let mut keys = 0;
        let mut expires = 0;
        let mut avg_ttl = 0;
        for part in value.split(',') {
            if let Some((k, v)) = part.split_once('=') {
                let num = v.parse::<u64>().unwrap_or(0);
                match k {
                    "keys" => keys = num,
                    "expires" => expires = num,
                    "avg_ttl" => avg_ttl = num,
                    _ => {}
                }
            }
        }
        dbs.push(DbInfo {
            db: key.clone(),
            keys,
            expires,
            avg_ttl,
        });
    }
    dbs.sort_by(|a, b| {
        let an = a.db.trim_start_matches("db").parse::<u64>().unwrap_or(0);
        let bn = b.db.trim_start_matches("db").parse::<u64>().unwrap_or(0);
        an.cmp(&bn)
    });
    dbs
}

fn parse_command_stats(sections: &[InfoSection]) -> Vec<CmdStat> {
    let mut stats = Vec::new();
    if let Some(section) = sections.iter().find(|s| s.name == "Commandstats") {
        for item in &section.items {
            if !item.key.starts_with("cmdstat_") {
                continue;
            }
            let name = item.key.trim_start_matches("cmdstat_").to_string();
            let mut calls = 0u64;
            let mut usec_per_call = 0f64;
            for part in item.value.split(',') {
                if let Some((k, v)) = part.split_once('=') {
                    match k {
                        "calls" => calls = v.parse().unwrap_or(0),
                        "usec_per_call" => usec_per_call = v.parse().unwrap_or(0.0),
                        _ => {}
                    }
                }
            }
            stats.push(CmdStat {
                name,
                calls,
                usec_per_call,
            });
        }
    }
    stats.sort_by(|a, b| b.calls.cmp(&a.calls));
    stats.truncate(8);
    stats
}

fn replication(map: &HashMap<String, String>) -> ReplicationInfo {
    ReplicationInfo {
        role: get_str(map, "role"),
        connected_slaves: get_u64(map, "connected_slaves"),
        master_host: map.get("master_host").cloned().filter(|s| !s.is_empty()),
        master_port: map.get("master_port").and_then(|v| v.parse::<u64>().ok()),
        master_link_status: map
            .get("master_link_status")
            .cloned()
            .filter(|s| !s.is_empty()),
        repl_offset: map
            .get("master_repl_offset")
            .or_else(|| map.get("slave_repl_offset"))
            .and_then(|v| v.parse::<i64>().ok()),
    }
}

pub async fn overview(session: &Session) -> Result<Overview, String> {
    let mut c1 = session.conn.clone();
    let mut c2 = session.conn.clone();
    let mut c3 = session.conn.clone();

    let info_fut = query::<String>(&mut c1, redis::cmd("INFO"));
    let size_fut = query::<u64>(&mut c2, redis::cmd("DBSIZE"));
    let slow_fut = {
        let mut cmd = redis::cmd("SLOWLOG");
        cmd.arg("LEN");
        query::<u64>(&mut c3, cmd)
    };
    let (info_res, size_res, slow_res) = tokio::join!(info_fut, size_fut, slow_fut);
    let info = info_res?;
    let dbsize = size_res.unwrap_or(0);
    let slowlog_len = slow_res.unwrap_or(0);

    let (sections, map) = parse_info(&info);
    let hits = get_u64(&map, "keyspace_hits");
    let misses = get_u64(&map, "keyspace_misses");
    let hit_rate = if hits + misses > 0 {
        hits as f64 / (hits + misses) as f64
    } else {
        0.0
    };

    Ok(Overview {
        version: get_str(&map, "redis_version"),
        mode: get_str(&map, "redis_mode"),
        role: get_str(&map, "role"),
        os: get_str(&map, "os"),
        uptime_secs: get_u64(&map, "uptime_in_seconds"),
        connected_clients: get_u64(&map, "connected_clients"),
        used_memory: get_u64(&map, "used_memory"),
        used_memory_peak: get_u64(&map, "used_memory_peak"),
        max_memory: get_u64(&map, "maxmemory"),
        maxmemory_policy: get_str(&map, "maxmemory_policy"),
        mem_fragmentation_ratio: map
            .get("mem_fragmentation_ratio")
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.0),
        total_connections_received: get_u64(&map, "total_connections_received"),
        total_commands_processed: get_u64(&map, "total_commands_processed"),
        ops_per_sec: get_u64(&map, "instantaneous_ops_per_sec"),
        keyspace_hits: hits,
        keyspace_misses: misses,
        expired_keys: get_u64(&map, "expired_keys"),
        evicted_keys: get_u64(&map, "evicted_keys"),
        rejected_connections: get_u64(&map, "rejected_connections"),
        net_input_bytes: get_u64(&map, "total_net_input_bytes"),
        net_output_bytes: get_u64(&map, "total_net_output_bytes"),
        rdb_last_save_time: get_u64(&map, "rdb_last_save_time"),
        aof_enabled: get_u64(&map, "aof_enabled") == 1,
        dbsize,
        dbs: parse_dbs(&map),
        slowlog_len,
        hit_rate,
        top_commands: parse_command_stats(&sections),
        replication: replication(&map),
        sections,
        sampled_at: now_ms(),
    })
}

pub async fn slowlog(session: &Session, count: u32) -> Result<Vec<SlowLogEntry>, String> {
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("SLOWLOG");
    cmd.arg("GET").arg(count.clamp(1, 512));
    let raw: Value = query(&mut conn, cmd).await?;

    let mut entries = Vec::new();
    if let Value::Array(items) = raw {
        for item in items {
            let Value::Array(parts) = item else { continue };
            let id = parts
                .first()
                .and_then(|v| redis::from_redis_value::<i64>(v).ok())
                .unwrap_or(0);
            let timestamp = parts
                .get(1)
                .and_then(|v| redis::from_redis_value::<i64>(v).ok())
                .unwrap_or(0);
            let duration_us = parts
                .get(2)
                .and_then(|v| redis::from_redis_value::<i64>(v).ok())
                .unwrap_or(0);
            let args = match parts.get(3) {
                Some(Value::Array(args)) => {
                    args.iter()
                        .map(|a| match a {
                            Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
                            Value::SimpleString(s) => s.clone(),
                            other => redis::from_redis_value::<String>(other)
                                .unwrap_or_else(|_| "?".into()),
                        })
                        .collect()
                }
                _ => Vec::new(),
            };
            let client = parts
                .get(4)
                .and_then(|v| redis::from_redis_value::<String>(v).ok())
                .unwrap_or_default();
            let client_name = parts
                .get(5)
                .and_then(|v| redis::from_redis_value::<String>(v).ok())
                .unwrap_or_default();
            entries.push(SlowLogEntry {
                id,
                timestamp,
                duration_us,
                args,
                client,
                client_name,
            });
        }
    }
    Ok(entries)
}

pub async fn slowlog_reset(session: &Session) -> Result<(), String> {
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("SLOWLOG");
    cmd.arg("RESET");
    let _: Value = query(&mut conn, cmd).await?;
    Ok(())
}

pub async fn clients(session: &Session) -> Result<Vec<ClientRow>, String> {
    let mut conn = session.conn.clone();
    let mut cmd = redis::cmd("CLIENT");
    cmd.arg("LIST");
    let raw: String = query(&mut conn, cmd).await?;
    Ok(raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let mut fields: HashMap<&str, &str> = HashMap::new();
            for pair in line.split(' ') {
                if let Some((k, v)) = pair.split_once('=') {
                    fields.insert(k, v);
                }
            }
            let get = |k: &str| fields.get(k).copied().unwrap_or("").to_string();
            ClientRow {
                id: get("id"),
                addr: get("addr"),
                name: get("name"),
                age: get("age").parse().unwrap_or(0),
                idle: get("idle").parse().unwrap_or(0),
                db: get("db").parse().unwrap_or(0),
                cmd: get("cmd"),
                user: get("user"),
                flags: get("flags"),
            }
        })
        .collect())
}

pub async fn databases(session: &Session) -> Result<Vec<DatabaseEntry>, String> {
    let mut info_conn = session.conn.clone();
    let mut count_conn = session.conn.clone();

    let info_fut = {
        let mut cmd = redis::cmd("INFO");
        cmd.arg("keyspace");
        query::<String>(&mut info_conn, cmd)
    };
    let count_fut = async {
        let mut cmd = redis::cmd("CONFIG");
        cmd.arg("GET").arg("databases");
        query::<Vec<String>>(&mut count_conn, cmd).await.ok()
    };
    let (info_result, configured) = tokio::join!(info_fut, count_fut);

    let mut total: i64 = 16;
    if let Some(values) = configured {
        if let Some(value) = values.get(1) {
            if let Ok(parsed) = value.parse::<i64>() {
                total = parsed.clamp(1, 256);
            }
        }
    }

    let mut counts: HashMap<i64, (u64, u64)> = HashMap::new();
    if let Ok(info) = info_result {
        for line in info.lines() {
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let Some(index) = key
                .strip_prefix("db")
                .and_then(|raw| raw.parse::<i64>().ok())
            else {
                continue;
            };
            let mut keys = 0;
            let mut expires = 0;
            for part in value.split(',') {
                if let Some((k, v)) = part.split_once('=') {
                    let number = v.parse::<u64>().unwrap_or(0);
                    match k {
                        "keys" => keys = number,
                        "expires" => expires = number,
                        _ => {}
                    }
                }
            }
            counts.insert(index, (keys, expires));
            total = total.max(index + 1);
        }
    }

    Ok((0..total)
        .map(|index| {
            let (keys, expires) = counts.get(&index).copied().unwrap_or((0, 0));
            DatabaseEntry {
                index,
                keys,
                expires,
            }
        })
        .collect())
}
