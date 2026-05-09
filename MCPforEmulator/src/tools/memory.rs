use serde::{Deserialize, Serialize};
use crate::frida::{FridaBridge, MemoryMatch, MemoryRegion};
use crate::config::load_config;

#[derive(Debug, Deserialize)]
pub struct ScanMemoryParams {
    pub device_id: String,
    pub pid: u32,
    pub pattern: String,
}

#[derive(Debug, Deserialize)]
pub struct ReadMemoryParams {
    pub device_id: String,
    pub pid: u32,
    pub address: String,
    pub size: usize,
}

#[derive(Debug, Deserialize)]
pub struct WriteMemoryParams {
    pub device_id: String,
    pub pid: u32,
    pub address: String,
    pub data: String, // hex encoded
}

#[derive(Debug, Deserialize)]
pub struct DumpMemoryParams {
    pub device_id: String,
    pub pid: u32,
    pub address: String,
    pub size: usize,
}

#[derive(Debug, Deserialize)]
pub struct EnumerateMemoryRegionsParams {
    pub device_id: String,
    pub pid: u32,
}

#[derive(Debug, Serialize)]
pub struct ScanMemoryResult {
    pub matches: Vec<MemoryMatch>,
}

#[derive(Debug, Serialize)]
pub struct ReadMemoryResult {
    pub data: String, // hex encoded
}

#[derive(Debug, Serialize)]
pub struct WriteMemoryResult {
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct DumpMemoryResult {
    pub data: String, // base64 encoded
}

#[derive(Debug, Serialize)]
pub struct EnumerateMemoryRegionsResult {
    pub regions: Vec<MemoryRegion>,
}

pub async fn scan_memory(params: ScanMemoryParams) -> Result<ScanMemoryResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let matches = frida.scan_memory(&params.device_id, params.pid, &params.pattern)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(ScanMemoryResult { matches })
}

pub async fn read_memory(params: ReadMemoryParams) -> Result<ReadMemoryResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let data = frida.read_memory(&params.device_id, params.pid, &params.address, params.size)
        .await
        .map_err(|e| e.to_string())?;
    
    // Convert bytes to hex string for transport
    let hex_data = hex::encode(&data);
    
    Ok(ReadMemoryResult { data: hex_data })
}

pub async fn write_memory(params: WriteMemoryParams) -> Result<WriteMemoryResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let data_bytes = hex::decode(&params.data).map_err(|e| e.to_string())?;
    frida.write_memory(&params.device_id, params.pid, &params.address, &data_bytes)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(WriteMemoryResult { success: true })
}

pub async fn dump_memory(params: DumpMemoryParams) -> Result<DumpMemoryResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let data = frida.read_memory(&params.device_id, params.pid, &params.address, params.size)
        .await
        .map_err(|e| e.to_string())?;
    
    // Convert to base64 for transport using new API
    use base64::{Engine as _, engine::general_purpose};
    let base64_data = general_purpose::STANDARD.encode(&data);
    
    Ok(DumpMemoryResult { data: base64_data })
}

pub async fn enumerate_memory_regions(
    params: EnumerateMemoryRegionsParams,
) -> Result<EnumerateMemoryRegionsResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let regions = frida.enumerate_memory_regions(&params.device_id, params.pid)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(EnumerateMemoryRegionsResult { regions })
}
