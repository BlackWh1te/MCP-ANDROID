use serde::{Deserialize, Serialize};

use crate::adb::{AdbBridge, Device};
use crate::config::load_config;

#[derive(Debug, Deserialize)]
pub struct ListDevicesParams {
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GetDeviceInfoParams {
    pub serial: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CheckConnectionParams {
    pub serial: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InstallApkParams {
    pub serial: String,
    pub apk_path: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UninstallPackageParams {
    pub serial: String,
    pub package_name: String,
    pub adb_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListDevicesResult {
    pub devices: Vec<Device>,
}

#[derive(Debug, Serialize)]
pub struct DeviceInfoResult {
    pub device: Device,
}

#[derive(Debug, Serialize)]
pub struct ConnectionCheckResult {
    pub connected: bool,
}

#[derive(Debug, Serialize)]
pub struct InstallApkResult {
    pub output: String,
}

#[derive(Debug, Serialize)]
pub struct UninstallPackageResult {
    pub output: String,
}

pub async fn list_devices(params: ListDevicesParams) -> Result<ListDevicesResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // List devices
    let devices = adb.list_devices().await.map_err(|e| e.to_string())?;
    
    Ok(ListDevicesResult { devices })
}

pub async fn get_device_info(params: GetDeviceInfoParams) -> Result<DeviceInfoResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // Get device info
    let device = adb.get_device_info(&params.serial).await.map_err(|e| e.to_string())?;
    
    Ok(DeviceInfoResult { device })
}

pub async fn check_connection(params: CheckConnectionParams) -> Result<ConnectionCheckResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // Check connection
    let connected = adb.check_connection(&params.serial).await.map_err(|e| e.to_string())?;
    
    Ok(ConnectionCheckResult { connected })
}

pub async fn install_apk(params: InstallApkParams) -> Result<InstallApkResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // Install APK
    let output = adb.install_apk(&params.serial, &params.apk_path).await.map_err(|e| e.to_string())?;
    
    Ok(InstallApkResult { output })
}

pub async fn uninstall_package(params: UninstallPackageParams) -> Result<UninstallPackageResult, String> {
    // Load configuration
    let mut config = load_config().map_err(|e| e.to_string())?;
    
    // Override ADB path if provided
    if let Some(adb_path) = params.adb_path {
        config.adb.path = Some(adb_path);
    }
    
    // Create ADB bridge
    let adb = AdbBridge::new(&config);
    
    // Uninstall package
    let output = adb.uninstall_package(&params.serial, &params.package_name).await.map_err(|e| e.to_string())?;
    
    Ok(UninstallPackageResult { output })
}
