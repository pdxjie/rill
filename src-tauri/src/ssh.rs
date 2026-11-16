use std::fs::{self, File};
use std::io::Read;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::model::SshConfig;

pub struct Tunnel {
    child: Child,
    pub local_port: u16,
    log_path: PathBuf,
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_file(&self.log_path);
    }
}

fn free_local_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("无法分配本地端口: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法读取本地端口: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

pub fn start(ssh: &SshConfig, remote_host: &str, remote_port: u16) -> Result<Tunnel, String> {
    if ssh.host.trim().is_empty() {
        return Err("SSH 跳板机地址为空".into());
    }
    if ssh.user.trim().is_empty() {
        return Err("SSH 用户名为空".into());
    }

    let local_port = free_local_port()?;
    let log_path = std::env::temp_dir().join(format!(
        "rill-ssh-{}-{}.log",
        std::process::id(),
        local_port
    ));
    let log = File::create(&log_path).map_err(|e| format!("无法创建 SSH 日志: {e}"))?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    let forward = format!("127.0.0.1:{}:{}:{}", local_port, remote_host, remote_port);
    let mut cmd = Command::new("/usr/bin/ssh");
    cmd.arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ConnectTimeout=8")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-N")
        .arg("-L")
        .arg(&forward)
        .arg("-p")
        .arg(ssh.port.to_string());

    if let Some(key) = ssh.key_path.as_ref().filter(|k| !k.trim().is_empty()) {
        let expanded = if let Some(rest) = key.trim().strip_prefix("~/") {
            match std::env::var("HOME") {
                Ok(home) => format!("{home}/{rest}"),
                Err(_) => key.trim().to_string(),
            }
        } else {
            key.trim().to_string()
        };
        cmd.arg("-i").arg(expanded);
    }
    cmd.arg(format!("{}@{}", ssh.user.trim(), ssh.host.trim()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log_err));

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 ssh 进程: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{local_port}")
                .parse()
                .map_err(|e| format!("本地地址解析失败: {e}"))?,
            Duration::from_millis(300),
        )
        .is_ok()
        {
            return Ok(Tunnel {
                child,
                local_port,
                log_path,
            });
        }

        if let Ok(Some(status)) = child.try_wait() {
            let mut detail = String::new();
            if let Ok(mut f) = File::open(&log_path) {
                let _ = f.read_to_string(&mut detail);
            }
            let _ = fs::remove_file(&log_path);
            let detail = detail.trim();
            return Err(if detail.is_empty() {
                format!("SSH 隧道启动失败 (exit {status})")
            } else {
                format!("SSH 隧道启动失败: {detail}")
            });
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let mut detail = String::new();
            if let Ok(mut f) = File::open(&log_path) {
                let _ = f.read_to_string(&mut detail);
            }
            let _ = fs::remove_file(&log_path);
            return Err(format!(
                "SSH 隧道超时（12 秒）。请确认跳板机可达且免密登录已配置。{}",
                if detail.trim().is_empty() {
                    String::new()
                } else {
                    format!(" 详情: {}", detail.trim())
                }
            ));
        }

        std::thread::sleep(Duration::from_millis(120));
    }
}
