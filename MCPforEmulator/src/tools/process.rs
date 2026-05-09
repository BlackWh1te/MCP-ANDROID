use serde::{Deserialize, Serialize};

use crate::adb::{AdbBridge, Process};
use crate::frida::{FridaBridge, ThreadInfo};
use crate::config::{load_config, load_default_bypass_script};

#[derive(Debug, Deserialize)]
pub struct ListProcessesParams {
    pub serial: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AttachProcessParams {
    pub serial: String,
    pub target: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SpawnProcessParams {
    pub serial: String,
    pub package: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EnumerateThreadsParams {
    pub device_id: String,
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct EnumerateModulesParams {
    pub device_id: String,
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct EnumerateExportsParams {
    pub device_id: String,
    pub pid: u32,
    pub module_name: String,
}

#[derive(Debug, Deserialize)]
pub struct EnumerateSymbolsParams {
    pub device_id: String,
    pub pid: u32,
    pub module_name: String,
}

#[derive(Debug, Serialize)]
pub struct ListProcessesResult {
    pub processes: Vec<Process>,
}

#[derive(Debug, Serialize)]
pub struct AttachProcessResult {
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct SpawnProcessResult {
    pub pid: u32,
}

#[derive(Debug, Serialize)]
pub struct EnumerateThreadsResult {
    pub threads: Vec<ThreadInfo>,
}

#[derive(Debug, Serialize)]
pub struct EnumerateModulesResult {
    pub modules: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct EnumerateExportsResult {
    pub exports: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct EnumerateSymbolsResult {
    pub symbols: Vec<serde_json::Value>,
}

pub async fn list_processes(params: ListProcessesParams) -> Result<ListProcessesResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // List processes
    let processes = adb.list_processes(&params.serial).await.map_err(|e| e.to_string())?;
    
    Ok(ListProcessesResult { processes })
}

pub async fn attach_process(params: AttachProcessParams) -> Result<AttachProcessResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create Frida bridge
    let frida = FridaBridge::new(&config);
    
    // Attach to process
    let session_id = frida.attach_process(&params.serial, &params.target).await.map_err(|e| e.to_string())?;
    
    // Auto-inject bypass script if enabled
    if config.bypass.auto_inject {
        let bypass_script = load_default_bypass_script(&config.bypass.bypass_type)
            .map_err(|e| e.to_string())?;
        
        // Inject bypass script
        let _ = frida.inject_script(&params.serial, &params.target, &bypass_script)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(AttachProcessResult { session_id })
}

pub async fn spawn_process(params: SpawnProcessParams) -> Result<SpawnProcessResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create Frida bridge
    let frida = FridaBridge::new(&config);
    
    // Spawn process
    let pid = frida.spawn_process(&params.serial, &params.package).await.map_err(|e| e.to_string())?;
    
    Ok(SpawnProcessResult { pid })
}

pub async fn enumerate_threads(params: EnumerateThreadsParams) -> Result<EnumerateThreadsResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let threads = frida.enumerate_threads(&params.device_id, params.pid)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(EnumerateThreadsResult { threads })
}

pub async fn enumerate_modules(params: EnumerateModulesParams) -> Result<EnumerateModulesResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let modules = frida.enumerate_modules(&params.device_id, params.pid)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(EnumerateModulesResult { modules })
}

pub async fn enumerate_exports(params: EnumerateExportsParams) -> Result<EnumerateExportsResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let exports = frida.enumerate_exports(&params.device_id, params.pid, &params.module_name)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(EnumerateExportsResult { exports })
}

pub async fn enumerate_symbols(params: EnumerateSymbolsParams) -> Result<EnumerateSymbolsResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let symbols = frida.enumerate_symbols(&params.device_id, params.pid, &params.module_name)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(EnumerateSymbolsResult { symbols })
}
