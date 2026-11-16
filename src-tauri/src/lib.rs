mod admin;
mod commands;
mod console;
mod keys;
mod model;
mod pubsub;
mod session;
mod ssh;
mod store;

pub fn run() {
    tauri::Builder::default()
        .manage(session::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::copy_to_clipboard,
            commands::list_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::test_connection,
            commands::connect,
            commands::disconnect,
            commands::list_databases,
            commands::switch_db,
            commands::overview,
            commands::scan_keys,
            commands::namespace_tree,
            commands::prefix_keys,
            commands::key_detail,
            commands::key_page,
            commands::set_string,
            commands::hash_set,
            commands::hash_del,
            commands::list_set,
            commands::list_push,
            commands::list_remove,
            commands::set_add,
            commands::set_remove,
            commands::zset_add,
            commands::zset_remove,
            commands::create_key,
            commands::delete_key,
            commands::rename_key,
            commands::expire_key,
            commands::persist_key,
            commands::analyze,
            commands::execute,
            commands::slowlog,
            commands::slowlog_reset,
            commands::clients,
            commands::pubsub_channels,
            commands::pubsub_start,
            commands::pubsub_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rill");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ConnectionConfig, ConsoleValue};

    fn local_config() -> ConnectionConfig {
        ConnectionConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: "integration".into(),
            host: "127.0.0.1".into(),
            port: 6379,
            db: 0,
            username: None,
            tls: false,
            tls_insecure: false,
            ssh: None,
            color: "#FF6B57".into(),
            env: "test".into(),
            read_only: false,
            has_password: false,
            created_at: 0,
            last_used_at: 0,
        }
    }

    #[test]
    fn keychain_roundtrip() {
        let id = format!("rill-test-{}", uuid::Uuid::new_v4());
        let secret = "rill-test-secret-42";
        if store::set_secret(&id, secret).is_err() {
            eprintln!("skipping keychain test: security CLI unavailable");
            return;
        }
        assert_eq!(store::get_secret(&id).as_deref(), Some(secret));
        store::delete_secret(&id);
        assert!(store::get_secret(&id).is_none());
    }

    #[tokio::test]
    #[ignore]
    async fn bench_large_dataset() {
        let port = std::env::var("RILL_BENCH_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(6390);
        let mut cfg = local_config();
        cfg.port = port;
        let (session, _) = session::open_session(&cfg, None)
            .await
            .expect("bench redis");
        let mut conn = session.conn.clone();

        let start = std::time::Instant::now();
        let mut cursor = 0;
        let mut total = 0usize;
        for _ in 0..5 {
            let page = keys::scan_keys(&session, cursor, None, None, 200)
                .await
                .expect("scan page");
            total += page.keys.len();
            cursor = page.cursor;
        }
        println!(
            "BENCH scan 5 pages: keys={} elapsed={:?} ({:.1} ms/page)",
            total,
            start.elapsed(),
            start.elapsed().as_secs_f64() * 1000.0 / 5.0
        );

        let start = std::time::Instant::now();
        let sparse = keys::scan_keys(
            &session,
            0,
            Some("bench:user:999999:profile".into()),
            None,
            200,
        )
        .await
        .expect("sparse scan");
        println!(
            "BENCH sparse scan: found={} cursor={} elapsed={:?}",
            sparse.keys.len(),
            sparse.cursor,
            start.elapsed()
        );

        let start = std::time::Instant::now();
        let detail = keys::key_detail(&session, "bench:user:999999:profile", 100)
            .await
            .expect("detail");
        println!(
            "BENCH key_detail type={} bytes={} elapsed={:?}",
            detail.meta.key_type,
            detail.length,
            start.elapsed()
        );

        let start = std::time::Instant::now();
        let overview = admin::overview(&session).await.expect("overview");
        println!(
            "BENCH overview dbsize={} elapsed={:?}",
            overview.dbsize,
            start.elapsed()
        );

        let start = std::time::Instant::now();
        let analysis = keys::analyze(&session, 1000).await.expect("analyze");
        println!(
            "BENCH analyze scanned={} elapsed={:?}",
            analysis.scanned,
            start.elapsed()
        );

        let start = std::time::Instant::now();
        let dbs = admin::databases(&session).await.expect("databases");
        println!(
            "BENCH databases count={} elapsed={:?}",
            dbs.len(),
            start.elapsed()
        );

        let _: redis::Value = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .expect("ping");
    }

    #[tokio::test]
    async fn redis_core_flow() {
        let cfg = local_config();
        let (session, _) = match session::open_session(&cfg, None).await {
            Ok(value) => value,
            Err(error) => {
                eprintln!("skipping integration test: {error}");
                return;
            }
        };

        let suffix = uuid::Uuid::new_v4().to_string();
        let string_key = format!("rill:it:string:{suffix}");
        let hash_key = format!("rill:it:hash:{suffix}");

        keys::set_string(
            &session,
            &string_key,
            r#"{"hello":"world","n":1}"#,
            Some(120),
        )
        .await
        .expect("set string");

        let detail = keys::key_detail(&session, &string_key, 50)
            .await
            .expect("key detail");
        assert_eq!(detail.meta.key_type, "string");
        assert!(detail.meta.ttl > 0);
        match detail.value {
            crate::model::ValueData::String { ref text, .. } => {
                assert!(text.contains("world"));
            }
            _ => panic!("expected string value"),
        }

        let page = keys::scan_keys(&session, 0, Some(string_key.clone()), None, 50)
            .await
            .expect("scan");
        assert!(page.keys.iter().any(|key| key.key == string_key));

        keys::create_key(&session, &hash_key, "hash")
            .await
            .expect("create hash");
        keys::hash_set(&session, &hash_key, "field_a", "value_a")
            .await
            .expect("hset");
        let hash_detail = keys::key_detail(&session, &hash_key, 50)
            .await
            .expect("hash detail");
        assert_eq!(hash_detail.meta.key_type, "hash");
        match hash_detail.value {
            crate::model::ValueData::Hash { ref items, .. } => {
                assert!(items
                    .iter()
                    .any(|item| item.field == "field_a" && item.value == "value_a"));
            }
            _ => panic!("expected hash value"),
        }

        let ping = console::execute(&session, "PING").await.expect("ping");
        assert!(matches!(ping.value, ConsoleValue::Status { ref value } if value == "PONG"));

        let get = console::execute(&session, &format!("GET {string_key}"))
            .await
            .expect("get");
        assert!(matches!(get.value, ConsoleValue::Bulk { .. }));
        assert!(
            console::execute(&session, "KEYS *").await.is_err(),
            "KEYS must be blocked to protect large databases"
        );

        let overview = admin::overview(&session).await.expect("overview");
        assert!(!overview.version.is_empty());
        assert!(overview.dbsize > 0);

        let clients = admin::clients(&session).await.expect("clients");
        assert!(!clients.is_empty());

        let slow = admin::slowlog(&session, 16).await.expect("slowlog");
        assert!(slow.len() <= 16);

        let analysis = keys::analyze(&session, 500).await.expect("analyze");
        assert!(analysis.scanned >= 1);

        let tree = keys::namespace_tree(&session, None, 100_000)
            .await
            .expect("namespace tree");
        assert!(tree.scanned >= 1);
        assert!(tree.entries.iter().any(|entry| entry.path == "rill"));
        assert!(tree.entries.iter().any(|entry| entry.path.starts_with("rill:it")));

        let typed = keys::scan_keys(&session, 0, None, Some("hash".to_string()), 100)
            .await
            .expect("typed scan");
        assert!(typed.keys.iter().all(|key| key.key_type == "hash"));

        let mixed = format!("rill:direct:{suffix}");
        let mixed_keys = [
            format!("{mixed}:a"),
            format!("{mixed}:b"),
            format!("{mixed}:child:c"),
        ];
        for (index, key) in mixed_keys.iter().enumerate() {
            keys::set_string(&session, key, &format!("v{index}"), None)
                .await
                .expect("mixed key");
        }
        let mixed_tree = keys::namespace_tree(&session, None, 100_000)
            .await
            .expect("mixed tree");
        let node = mixed_tree
            .entries
            .iter()
            .find(|entry| entry.path == mixed)
            .expect("mixed node");
        assert_eq!(node.direct, 2, "two keys directly under mixed namespace");
        assert_eq!(node.count, 3, "one deeper key is counted in total");
        let direct = keys::prefix_keys(&session, &mixed, 0, 200)
            .await
            .expect("prefix keys");
        assert_eq!(direct.keys.len(), 2, "only direct children are returned");
        assert!(
            direct.keys.iter().all(|key| key.key != format!("{mixed}:child:c")),
            "deeper keys must not leak into the tree level"
        );
        for key in &mixed_keys {
            keys::delete_key(&session, key).await.expect("cleanup mixed");
        }

        let db0_key = format!("rill:it:db0:{suffix}");
        keys::set_string(&session, &db0_key, "zero", None)
            .await
            .expect("set db0 key");
        session.switch_db(1).await.expect("switch to db1");
        assert_eq!(session.db(), 1);
        let mut conn = session.conn.clone();
        let exists_in_db0: i64 = redis::cmd("EXISTS")
            .arg(&db0_key)
            .query_async(&mut conn)
            .await
            .expect("exists");
        assert_eq!(exists_in_db0, 0, "db1 must not see db0 keys");
        let db1_key = format!("rill:it:db1:{suffix}");
        keys::set_string(&session, &db1_key, "one", None)
            .await
            .expect("set db1 key");
        let dbs = admin::databases(&session).await.expect("databases");
        assert!(dbs.len() >= 2);
        assert!(dbs.iter().any(|db| db.index == 1 && db.keys >= 1));
        session.switch_db(0).await.expect("switch back to db0");
        let existing: i64 = redis::cmd("EXISTS")
            .arg(&db0_key)
            .query_async(&mut conn)
            .await
            .expect("exists again");
        assert_eq!(existing, 1);
        keys::delete_key(&session, &db0_key)
            .await
            .expect("delete db0");
        session.switch_db(1).await.expect("switch to db1 cleanup");
        keys::delete_key(&session, &db1_key)
            .await
            .expect("delete db1");
        session.switch_db(0).await.expect("switch back");

        keys::expire_key(&session, &string_key, 30)
            .await
            .expect("expire");
        keys::rename_key(&session, &string_key, &format!("{string_key}:renamed"))
            .await
            .expect("rename");
        keys::delete_key(&session, &format!("{string_key}:renamed"))
            .await
            .expect("delete renamed");
        keys::delete_key(&session, &hash_key)
            .await
            .expect("delete hash");

        let mut db1_cfg = cfg.clone();
        db1_cfg.id = uuid::Uuid::new_v4().to_string();
        db1_cfg.db = 1;
        if let Ok((db1_session, _)) = session::open_session(&db1_cfg, None).await {
            let mut conn = db1_session.conn.clone();
            let client_info: String = redis::cmd("CLIENT")
                .arg("INFO")
                .query_async(&mut conn)
                .await
                .expect("client info");
            assert!(
                client_info.contains("db=1"),
                "db selection not applied: {client_info}"
            );
        }

        let mut readonly_cfg = cfg.clone();
        readonly_cfg.id = uuid::Uuid::new_v4().to_string();
        readonly_cfg.read_only = true;
        if let Ok((readonly, _)) = session::open_session(&readonly_cfg, None).await {
            let blocked = keys::set_string(&readonly, "rill:it:blocked", "x", None).await;
            assert!(blocked.is_err(), "read-only guard should reject writes");
            let blocked_cmd = console::execute(&readonly, "SET rill:it:blocked x").await;
            assert!(
                blocked_cmd.is_err(),
                "read-only console should reject writes"
            );
        }
    }
}
