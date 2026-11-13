//! Flash Launcher: a Tauri shell over the Horizon Offline Launcher engine, used for Minecraft:
//! Java Edition only.
//!
//! Everything that touches the game goes through the engine's CLI (`flash-engine`, shipped beside
//! this program as a sidecar): Java instances with Fabric/Quilt/Forge/NeoForge, Modrinth mods and
//! `.mrpack` modpacks, offline names and skins, and Play. Players sign in to the launcher with
//! Steam (OpenID 2.0) or as a guest; either way they play under an offline name. This file
//! spawns the engine, relays its output, signs in with Steam, and fetches the browsing data the
//! UI shows from a fixed list of hosts.

use base64::Engine;
use std::io::Read;
use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

/// The CLI subcommands the UI may run.
const ALLOWED: &[&str] = &[
    "play", "account", "instance", "mods", "settings", "logs", "java", "worlds", "screenshots", "game-args",
];

/// Hosts `http_json` may read.
const HOSTS: &[&str] = &[
    "https://api.modrinth.com/",
    "https://piston-meta.mojang.com/",
    "https://launchermeta.mojang.com/",
    "https://meta.fabricmc.net/",
    "https://flash-launcher-api.vercel.app/",
];

/// The app's config folder, set once at start.
static CONFIG: OnceLock<PathBuf> = OnceLock::new();

const STEAM_OPENID: &str = "https://steamcommunity.com/openid/login";
const OPENID_NS: &str = "http://specs.openid.net/auth/2.0";

fn exe_name() -> &'static str {
    if cfg!(windows) { "flash-engine.exe" } else { "flash-engine" }
}

/// Where the engine is: $FLASH_ENGINE, beside this program (the bundled sidecar), else PATH.
fn cli_path() -> PathBuf {
    if let Ok(p) = std::env::var("FLASH_ENGINE") {
        return PathBuf::from(p);
    }
    if let Ok(me) = std::env::current_exe() {
        if let Some(dir) = me.parent() {
            let beside = dir.join(exe_name());
            if beside.exists() {
                return beside;
            }
        }
    }
    PathBuf::from(exe_name())
}

fn check_args(args: &[String]) -> Result<(), String> {
    match args.first() {
        Some(cmd) if ALLOWED.contains(&cmd.as_str()) => Ok(()),
        Some(cmd) => Err(format!("Команда «{cmd}» недоступна из интерфейса")),
        None => Err("Пустая команда".into()),
    }
}

fn command(args: &[String]) -> Command {
    let mut c = Command::new(cli_path());
    c.arg("--json").args(args);
    c.env("HORIZON_LAUNCHER_NO_SELF_UPDATE", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

/// Runs a CLI command to the end; its stdout parsed as JSON when it is, else as text.
#[tauri::command]
async fn engine(args: Vec<String>) -> Result<Value, String> {
    check_args(&args)?;
    tauri::async_runtime::spawn_blocking(move || {
        let out = command(&args)
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("Не удалось запустить движок Flash ({}): {e}", cli_path().display()))?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if !out.status.success() {
            let msg = if stderr.is_empty() { stdout } else { stderr };
            return Err(if msg.is_empty() { format!("Код выхода {:?}", out.status.code()) } else { msg });
        }
        Ok(serde_json::from_str(&stdout).unwrap_or(Value::String(stdout)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize)]
struct LogLine {
    id: String,
    line: String,
    err: bool,
}

#[derive(Clone, Serialize)]
struct Done {
    id: String,
    code: Option<i32>,
}

/// Starts a long CLI command (install, prepare, play…) and streams its lines as `hz-log`
/// events, then `hz-done` with its exit code.
#[tauri::command]
fn engine_stream(app: AppHandle, id: String, args: Vec<String>) -> Result<(), String> {
    check_args(&args)?;
    let mut child = command(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Не удалось запустить движок Flash ({}): {e}", cli_path().display()))?;
    let pipes = [
        (child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), false),
        (child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), true),
    ];
    for (pipe, err) in pipes {
        if let Some(pipe) = pipe {
            let app = app.clone();
            let id = id.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                    let _ = app.emit("hz-log", LogLine { id: id.clone(), line, err });
                }
            });
        }
    }
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        // Let the readers drain the last lines first.
        std::thread::sleep(std::time::Duration::from_millis(150));
        let _ = app.emit("hz-done", Done { id, code });
    });
    Ok(())
}

/// GET a JSON document from one of [`HOSTS`].
#[tauri::command]
async fn http_json(url: String) -> Result<Value, String> {
    if !HOSTS.iter().any(|h| url.starts_with(h)) {
        return Err(format!("Адрес не разрешён: {url}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        ureq::get(&url)
            .set("User-Agent", "wayy-digital/flash-launcher/0.3.0 (wayy.digital)")
            .set("X-Flash-Launcher", "1")
            .timeout(std::time::Duration::from_secs(20))
            .call()
            .map_err(|e| e.to_string())?
            .into_json::<Value>()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Downloads a modpack (.mrpack) from Modrinth's CDN into the cache; returns its path.
#[tauri::command]
async fn download_mrpack(app: AppHandle, url: String, name: String) -> Result<String, String> {
    if !url.starts_with("https://cdn.modrinth.com/") || !url.ends_with(".mrpack") {
        return Err(format!("Адрес не разрешён: {url}"));
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("modpacks");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '_' }).collect();
    let path = dir.join(safe);
    tauri::async_runtime::spawn_blocking(move || {
        let resp = ureq::get(&url)
            .set("User-Agent", "wayy-digital/flash-launcher/0.2.0 (wayy.digital)")
            .call()
            .map_err(|e| e.to_string())?;
        let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        std::io::copy(&mut resp.into_reader().take(2 << 30), &mut file).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct GameLog {
    path: String,
    text: String,
}

/// The end of an instance's `logs/latest.log`, or its newest crash report.
#[tauri::command]
fn read_game_log(home: String, crash: bool) -> Result<GameLog, String> {
    let home = PathBuf::from(home);
    let path = if crash {
        std::fs::read_dir(home.join("crash-reports"))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "txt"))
            .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
            .map(|e| e.path())
            .ok_or("No such file: no crash reports")?
    } else {
        home.join("logs").join("latest.log")
    };
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = text.lines().collect();
    let tail = lines[lines.len().saturating_sub(300)..].join("\n");
    Ok(GameLog { path: path.to_string_lossy().into_owned(), text: tail })
}

#[derive(Serialize)]
struct SteamProfile {
    steamid: String,
    name: String,
    avatar: Option<String>,
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(b);
                    i += 2;
                } else {
                    out.push(b'%');
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The text between `<tag><![CDATA[` and `]]></tag>` (or plain `<tag>…</tag>`) in Steam's XML.
fn xml_field(xml: &str, tag: &str) -> Option<String> {
    let start = xml.find(&format!("<{tag}>"))? + tag.len() + 2;
    let end = start + xml[start..].find(&format!("</{tag}>"))?;
    let inner = xml[start..end].trim();
    let inner = inner.strip_prefix("<![CDATA[").and_then(|x| x.strip_suffix("]]>")).unwrap_or(inner);
    Some(inner.trim().to_string()).filter(|s| !s.is_empty())
}

const STEAM_DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Flash Launcher</title><body style=\"background:#0a0a0b;color:#f4f4f6;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><div style=\"font-size:40px\">&#9889;</div><h2>Вход через Steam выполнен</h2><p style=\"color:#8b8b94\">Можно закрыть вкладку и вернуться в Flash Launcher.</p></div>";
const STEAM_FAIL_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Flash Launcher</title><body style=\"background:#0a0a0b;color:#f4f4f6;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h2>Steam не подтвердил вход</h2><p style=\"color:#8b8b94\">Вернитесь в Flash Launcher и попробуйте ещё раз.</p></div>";

/// Signs in with Steam: OpenID 2.0 in the player's browser, answered on a loopback port, the
/// assertion checked back with Steam (`check_authentication`), then the public profile's name
/// and avatar. No Web API key is involved.
#[tauri::command]
async fn steam_login(app: AppHandle) -> Result<SteamProfile, String> {
    use std::io::Write;
    use tauri_plugin_opener::OpenerExt;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let return_to = format!("http://127.0.0.1:{port}/steam");
    let realm = format!("http://127.0.0.1:{port}/");
    let url = format!(
        "{STEAM_OPENID}?openid.ns={ns}&openid.mode=checkid_setup&openid.return_to={rt}&openid.realm={realm}&openid.identity={sel}&openid.claimed_id={sel}",
        ns = url_encode(OPENID_NS),
        rt = url_encode(&return_to),
        realm = url_encode(&realm),
        sel = url_encode("http://specs.openid.net/auth/2.0/identifier_select"),
    );
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            if std::time::Instant::now() > deadline {
                return Err("Время входа через Steam истекло — попробуйте ещё раз".to_string());
            }
            let (mut stream, _) = match listener.accept() {
                Ok(c) => c,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            };
            stream.set_nonblocking(false).ok();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();
            let mut buf = vec![0u8; 16 * 1024];
            let n = stream.read(&mut buf).unwrap_or(0);
            let head = String::from_utf8_lossy(&buf[..n]).to_string();
            let target = head.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
            let Some(query) = target.strip_prefix("/steam?") else {
                // the favicon or anything else: not ours
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                continue;
            };
            let params: Vec<(String, String)> = query
                .split('&')
                .filter_map(|kv| kv.split_once('='))
                .map(|(k, v)| (url_decode(k), url_decode(v)))
                .collect();
            let get = |k: &str| params.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
            let checked = (|| -> Result<String, String> {
                if get("openid.mode").as_deref() != Some("id_res") {
                    return Err("Вход через Steam отменён".into());
                }
                if get("openid.return_to").as_deref() != Some(return_to.as_str()) {
                    return Err("Steam вернул чужой адрес".into());
                }
                let claimed = get("openid.claimed_id").unwrap_or_default();
                let steamid = claimed
                    .strip_prefix("https://steamcommunity.com/openid/id/")
                    .filter(|id| id.len() == 17 && id.chars().all(|c| c.is_ascii_digit()))
                    .ok_or("Steam не прислал SteamID")?
                    .to_string();
                // Ask Steam whether this assertion is really its own.
                let mut form: Vec<(String, String)> = params
                    .iter()
                    .filter(|(k, _)| k.starts_with("openid.") && k != "openid.mode")
                    .cloned()
                    .collect();
                form.push(("openid.mode".into(), "check_authentication".into()));
                let pairs: Vec<(&str, &str)> = form.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
                let answer = ureq::post(STEAM_OPENID)
                    .timeout(std::time::Duration::from_secs(20))
                    .send_form(&pairs)
                    .map_err(|e| e.to_string())?
                    .into_string()
                    .map_err(|e| e.to_string())?;
                if !answer.lines().any(|l| l.trim() == "is_valid:true") {
                    return Err("Steam не подтвердил вход".into());
                }
                Ok(steamid)
            })();
            let page = if checked.is_ok() { STEAM_DONE_PAGE } else { STEAM_FAIL_PAGE };
            let _ = stream.write_all(
                format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len())
                    .as_bytes(),
            );
            let steamid = checked?;
            // Name and avatar from the public profile (shown even for private profiles).
            let xml = ureq::get(&format!("https://steamcommunity.com/profiles/{steamid}/?xml=1"))
                .timeout(std::time::Duration::from_secs(20))
                .call()
                .ok()
                .and_then(|r| r.into_string().ok())
                .unwrap_or_default();
            let name = xml_field(&xml, "steamID").unwrap_or_else(|| format!("Steam {}", &steamid[13..]));
            let avatar = xml_field(&xml, "avatarFull").or_else(|| xml_field(&xml, "avatarMedium"));
            return Ok(SteamProfile { steamid, name, avatar });
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The update found by the last check, kept for `update_install`.
static PENDING: Mutex<Option<tauri_plugin_updater::Update>> = Mutex::new(None);

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    date: Option<String>,
}

/// Asks the update server whether a newer Flash Launcher is out (signed with our key).
#[tauri::command]
async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    *PENDING.lock().unwrap() = update;
    Ok(info)
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Downloads the update found by `update_check`, checks its signature, installs it and
/// restarts into the new version. Progress goes out as `update-progress` events.
#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = PENDING.lock().unwrap().take().ok_or("Сначала проверьте обновления")?;
    let downloaded = std::sync::atomic::AtomicU64::new(0);
    let emitter = app.clone();
    update
        .download_and_install(
            |chunk, total| {
                let now = downloaded.fetch_add(chunk as u64, std::sync::atomic::Ordering::Relaxed) + chunk as u64;
                let _ = emitter.emit("update-progress", UpdateProgress { downloaded: now, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The UI's own state (setup done, guest name, play sessions): a JSON file in the config folder.
#[tauri::command]
fn state_load(app: AppHandle) -> Result<Value, String> {
    let path = data_dir(&app)?.join("ui-state.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(serde_json::from_str(&s).unwrap_or(Value::Null)),
        Err(_) => Ok(Value::Null),
    }
}

#[tauri::command]
fn state_save(app: AppHandle, state: Value) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let tmp = dir.join("ui-state.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("ui-state.json")).map_err(|e| e.to_string())
}

/// Saves a skin PNG (base64) the editor made; returns its path for `account skin`.
#[tauri::command]
fn save_skin(app: AppHandle, name: String, png_base64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim_start_matches("data:image/png;base64,"))
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1_000_000 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Это не PNG скина".into());
    }
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    let dir = data_dir(&app)?.join("skins");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.png", if safe.is_empty() { "skin".into() } else { safe }));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Reads a PNG the player picked (a skin to edit), as a data URL.
#[tauri::command]
fn read_png(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > 1_000_000 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Выберите PNG-файл скина (64×64)".into());
    }
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[derive(Serialize)]
struct EngineInfo {
    path: String,
    found: bool,
    version: Option<String>,
}

/// Whether the engine is there, and its version.
#[tauri::command]
fn engine_info() -> EngineInfo {
    let path = cli_path();
    let version = Command::new(&path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    EngineInfo { path: path.to_string_lossy().into_owned(), found: version.is_some(), version }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if let Ok(dir) = app.path().app_config_dir() {
                let _ = CONFIG.set(dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine,
            engine_stream,
            http_json,
            state_load,
            state_save,
            save_skin,
            read_png,
            engine_info,
            steam_login,
            update_check,
            update_install,
            download_mrpack,
            read_game_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running Flash Launcher");
}
