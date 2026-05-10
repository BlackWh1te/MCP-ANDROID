//! RMCP-based MCP server implementation
//!
//! This module implements the MCP server using the official Rust MCP SDK (rmcp).
//! It provides tools for Android device management, Frida integration, and memory inspection.

use anyhow::Result;
use rmcp::{
    handler::server::wrapper::Parameters,
    tool,
    tool_router,
    prompt,
    prompt_handler,
    prompt_router,
    ServerHandler,
    ServiceExt,
    service::{RequestContext, ServiceRole},
    model::{ServerInfo, ServerCapabilities, ListResourcesResult as McpListResourcesResult, ReadResourceRequestParams, ReadResourceResult, ResourceContents, RawResource, ListResourceTemplatesResult, ResourceTemplate, ListPromptsResult, GetPromptResult, PromptMessage, PromptArgument, AnnotateAble},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tracing::{info, error, warn};
use std::sync::Arc;

use crate::adb::{AdbBridge, Device, Process};
use crate::frida::{FridaBridge, ThreadInfo, MemoryMatch, MemoryRegion, HookInfo};
use crate::config::{Config, load_config, load_default_bypass_script};
use crate::session::SessionManager;
use crate::rate_limiter::RateLimiter;
use crate::tools;
use uuid::Uuid;

/// MCP Frida Android Server
///
/// This struct implements the ServerHandler trait and provides
/// tools for Android reverse engineering via Frida.
#[derive(Clone)]
pub struct McpFridaServer {
    /// Server configuration
    config: Config,
    /// ADB bridge for device communication
    adb: AdbBridge,
    /// Frida bridge for dynamic instrumentation
    frida: FridaBridge,
    /// Session manager for Frida attachments
    session_manager: SessionManager,
    /// Rate limiter for memory operations
    memory_rate_limiter: RateLimiter,
}

impl McpFridaServer {
    /// Create a new MCP Frida server instance
    pub fn new(config: Config) -> Self {
        let adb = AdbBridge::new(&config);
        let frida = FridaBridge::new(&config);
        let session_manager = SessionManager::new();
        // Rate limit memory operations: 50 requests per minute per device
        let memory_rate_limiter = RateLimiter::new(50, 60);
        Self { config, adb, frida, session_manager, memory_rate_limiter }
    }
}

// Tool parameter structures

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListDevicesParams {
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetDeviceInfoParams {
    #[schemars(description = "Device serial number")]
    pub serial: String,
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CheckConnectionParams {
    #[schemars(description = "Device serial number")]
    pub serial: String,
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

// Tool result structures

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
pub struct ToolError {
    pub error: String,
}

// Process tool parameters

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListProcessesParams {
    #[schemars(description = "Device serial number")]
    pub serial: String,
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AttachProcessParams {
    #[schemars(description = "Device serial number")]
    pub serial: String,
    #[schemars(description = "Target process name or PID")]
    pub target: String,
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SpawnProcessParams {
    #[schemars(description = "Device serial number")]
    pub serial: String,
    #[schemars(description = "Package name to spawn")]
    pub package: String,
    #[schemars(description = "Optional custom ADB path")]
    pub adb_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EnumerateThreadsParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EnumerateModulesParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EnumerateExportsParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Module name")]
    pub module_name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EnumerateSymbolsParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Module name")]
    pub module_name: String,
}

// Memory tool parameters

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScanMemoryParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Hex pattern to search for")]
    pub pattern: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReadMemoryParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Memory address (hex string)")]
    pub address: String,
    #[schemars(description = "Number of bytes to read")]
    pub size: usize,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WriteMemoryParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Memory address (hex string)")]
    pub address: String,
    #[schemars(description = "Data to write (hex encoded)")]
    pub data: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DumpMemoryParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Memory address (hex string)")]
    pub address: String,
    #[schemars(description = "Number of bytes to dump")]
    pub size: usize,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EnumerateMemoryRegionsParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
}

// Script tool parameters

#[derive(Debug, Deserialize, JsonSchema)]
pub struct InjectScriptParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Target process name or PID")]
    pub target: String,
    #[schemars(description = "Frida script to inject")]
    pub script: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ExecuteScriptParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Frida script to execute")]
    pub script: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListHooksParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TraceFunctionParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "Module name")]
    pub module: String,
    #[schemars(description = "Function name")]
    pub function: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct MonitorApiCallsParams {
    #[schemars(description = "Device serial number")]
    pub device_id: String,
    #[schemars(description = "Process ID")]
    pub pid: u32,
    #[schemars(description = "API function name to monitor")]
    pub api_name: String,
}

// Session tool parameters

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListSessionsParams {
    #[schemars(description = "Optional device serial to filter sessions")]
    pub device_serial: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CloseSessionParams {
    #[schemars(description = "Session ID to close")]
    pub session_id: String,
}

// Process tool results

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

// Memory tool results

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

// Script tool results

#[derive(Debug, Serialize)]
pub struct InjectScriptResult {
    pub output: String,
}

#[derive(Debug, Serialize)]
pub struct ExecuteScriptResult {
    pub output: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ListHooksResult {
    pub hooks: Vec<HookInfo>,
}

#[derive(Debug, Serialize)]
pub struct TraceFunctionResult {
    pub success: bool,
    pub trace_id: String,
}

#[derive(Debug, Serialize)]
pub struct MonitorApiCallsResult {
    pub success: bool,
    pub monitor_id: String,
}

// Session tool results

#[derive(Debug, Serialize)]
pub struct ListSessionsResult {
    pub sessions: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct CloseSessionResult {
    pub success: bool,
}

// Prompt parameter structures

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AnalyzeAppParams {
    #[schemars(description = "Package name of the app to analyze")]
    pub package_name: String,
    #[schemars(description = "Device serial number")]
    pub device_serial: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct HookNetworkParams {
    #[schemars(description = "Package name to monitor")]
    pub package_name: String,
    #[schemars(description = "Device serial number")]
    pub device_serial: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BypassSslParams {
    #[schemars(description = "Package name to bypass SSL for")]
    pub package_name: String,
    #[schemars(description = "Device serial number")]
    pub device_serial: String,
}

// Prompt router implementation for common reverse engineering workflows
#[prompt_router]
impl McpFridaServer {
    /// Analyze an Android app for security vulnerabilities
    #[prompt(description = "Comprehensive Android app security analysis workflow")]
    fn analyze_app(
        &self,
        Parameters(AnalyzeAppParams { package_name, device_serial }): Parameters<AnalyzeAppParams>,
    ) -> Vec<PromptMessage> {
        vec![
            PromptMessage {
                role: "user".to_string(),
                content: format!(
                    "I need to perform a comprehensive security analysis of the Android app '{}' on device '{}'. \
                    Please help me with the following steps:\n\n\
                    1. First, list all connected devices and verify the device is available\n\
                    2. Get detailed information about the device\n\
                    3. List all running processes to find the app process\n\
                    4. Attach Frida to the app process\n\
                    5. Monitor network operations to identify API endpoints\n\
                    6. Check for SSL pinning and bypass it if present\n\
                    7. Analyze memory regions for sensitive data\n\
                    8. Hook encryption functions to analyze data protection\n\
                    9. Generate a comprehensive security report\n\n\
                    Please proceed step by step and let me know if you encounter any issues.",
                    package_name, device_serial
                ).to_string(),
            },
        ]
    }

    /// Hook and monitor network operations
    #[prompt(description = "Monitor and analyze network traffic from an Android app")]
    fn hook_network(
        &self,
        Parameters(HookNetworkParams { package_name, device_serial }): Parameters<HookNetworkParams>,
    ) -> Vec<PromptMessage> {
        vec![
            PromptMessage {
                role: "user".to_string(),
                content: format!(
                    "I need to monitor network traffic from the Android app '{}' on device '{}'. \
                    Please help me:\n\n\
                    1. List all connected devices\n\
                    2. Find the process ID for '{}'\n\
                    3. Attach Frida to the process\n\
                    4. Inject the network monitoring script\n\
                    5. Monitor HTTP/HTTPS requests and responses\n\
                    6. Capture headers, bodies, and URLs\n\
                    7. Identify API endpoints and data formats\n\
                    8. Report any security concerns in the network traffic\n\n\
                    Start by listing devices and finding the process.",
                    package_name, device_serial, package_name
                ).to_string(),
            },
        ]
    }

    /// Bypass SSL pinning for an app
    #[prompt(description = "Bypass SSL certificate pinning in an Android app")]
    fn bypass_ssl(
        &self,
        Parameters(BypassSslParams { package_name, device_serial }): Parameters<BypassSslParams>,
    ) -> Vec<PromptMessage> {
        vec![
            PromptMessage {
                role: "user".to_string(),
                content: format!(
                    "I need to bypass SSL pinning for the Android app '{}' on device '{}'. \
                    Please help me:\n\n\
                    1. List all connected devices\n\
                    2. Find the process ID for '{}'\n\
                    3. Attach Frida to the process\n\
                    4. Inject the SSL pinning bypass script\n\
                    5. Verify that HTTPS traffic can now be intercepted\n\
                    6. Test network monitoring to confirm bypass is working\n\
                    7. Report any issues or limitations\n\n\
                    This is for security research purposes only.",
                    package_name, device_serial, package_name
                ).to_string(),
            },
        ]
    }
}

// Tool router implementation
#[tool_router]
impl McpFridaServer {
    /// List all connected Android devices
    #[tool(description = "List all connected Android devices via ADB")]
    async fn list_devices(
        &self,
        Parameters(ListDevicesParams { adb_path }): Parameters<ListDevicesParams>,
    ) -> String {
        info!("Listing devices with adb_path: {:?}", adb_path);

        // Use custom ADB path if provided
        let adb = if let Some(path) = adb_path {
            AdbBridge::new_with_path(&path)
        } else {
            self.adb.clone()
        };

        // List devices using the ADB bridge
        match adb.list_devices().await {
            Ok(devices) => {
                serde_json::to_string(&ListDevicesResult { devices })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to list devices: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to list devices: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Get detailed information about a specific device
    #[tool(description = "Get detailed information about a specific Android device")]
    async fn get_device_info(
        &self,
        Parameters(GetDeviceInfoParams { serial, adb_path }): Parameters<GetDeviceInfoParams>,
    ) -> String {
        info!("Getting device info for serial: {}", serial);

        // Use custom ADB path if provided
        let adb = if let Some(path) = adb_path {
            AdbBridge::new_with_path(&path)
        } else {
            self.adb.clone()
        };

        // Get device info using the ADB bridge
        match adb.get_device_info(&serial).await {
            Ok(device) => {
                serde_json::to_string(&DeviceInfoResult { device })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to get device info: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to get device info: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Check if a device is connected and responsive
    #[tool(description = "Check if a device is connected and responsive")]
    async fn check_connection(
        &self,
        Parameters(CheckConnectionParams { serial, adb_path }): Parameters<CheckConnectionParams>,
    ) -> String {
        info!("Checking connection for serial: {}", serial);

        // Use custom ADB path if provided
        let adb = if let Some(path) = adb_path {
            AdbBridge::new_with_path(&path)
        } else {
            self.adb.clone()
        };

        // Check connection using the ADB bridge
        match adb.check_connection(&serial).await {
            Ok(connected) => {
                serde_json::to_string(&ConnectionCheckResult { connected })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to check connection: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to check connection: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    // Process management tools

    /// List running processes on a device
    #[tool(description = "List running processes on an Android device")]
    async fn list_processes(
        &self,
        Parameters(ListProcessesParams { serial, adb_path }): Parameters<ListProcessesParams>,
    ) -> String {
        info!("Listing processes for device: {}", serial);

        let adb = if let Some(path) = adb_path {
            AdbBridge::new_with_path(&path)
        } else {
            self.adb.clone()
        };

        match adb.list_processes(&serial).await {
            Ok(processes) => {
                serde_json::to_string(&ListProcessesResult { processes })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to list processes: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to list processes: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Attach Frida to a running process
    #[tool(description = "Attach Frida to a running process")]
    async fn attach_process(
        &self,
        Parameters(AttachProcessParams { serial, target, adb_path }): Parameters<AttachProcessParams>,
    ) -> String {
        info!("Attaching to process: {} on device: {}", target, serial);

        let frida = if let Some(_path) = adb_path {
            self.frida.clone()
        } else {
            self.frida.clone()
        };

        match frida.attach_process(&serial, &target).await {
            Ok(session_id) => {
                // Auto-inject bypass script if enabled
                if self.config.bypass.auto_inject {
                    if let Ok(bypass_script) = load_default_bypass_script(&self.config.bypass.bypass_type) {
                        let _ = frida.inject_script(&serial, &target, &bypass_script).await;
                    }
                }
                serde_json::to_string(&AttachProcessResult { session_id })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to attach process: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to attach process: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Spawn a new process with Frida attached
    #[tool(description = "Spawn a new Android app with Frida attached")]
    async fn spawn_process(
        &self,
        Parameters(SpawnProcessParams { serial, package, adb_path }): Parameters<SpawnProcessParams>,
    ) -> String {
        info!("Spawning package: {} on device: {}", package, serial);

        let frida = if let Some(_path) = adb_path {
            self.frida.clone()
        } else {
            self.frida.clone()
        };

        match frida.spawn_process(&serial, &package).await {
            Ok(pid) => {
                serde_json::to_string(&SpawnProcessResult { pid })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to spawn process: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to spawn process: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Enumerate threads in a process
    #[tool(description = "Enumerate threads in a process")]
    async fn enumerate_threads(
        &self,
        Parameters(EnumerateThreadsParams { device_id, pid }): Parameters<EnumerateThreadsParams>,
    ) -> String {
        info!("Enumerating threads for PID: {} on device: {}", pid, device_id);

        match self.frida.enumerate_threads(&device_id, pid).await {
            Ok(threads) => {
                serde_json::to_string(&EnumerateThreadsResult { threads })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to enumerate threads: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to enumerate threads: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Enumerate modules in a process
    #[tool(description = "Enumerate loaded modules in a process")]
    async fn enumerate_modules(
        &self,
        Parameters(EnumerateModulesParams { device_id, pid }): Parameters<EnumerateModulesParams>,
    ) -> String {
        info!("Enumerating modules for PID: {} on device: {}", pid, device_id);

        match self.frida.enumerate_modules(&device_id, pid).await {
            Ok(modules) => {
                serde_json::to_string(&EnumerateModulesResult { modules })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to enumerate modules: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to enumerate modules: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Enumerate exports from a module
    #[tool(description = "Enumerate exported functions from a module")]
    async fn enumerate_exports(
        &self,
        Parameters(EnumerateExportsParams { device_id, pid, module_name }): Parameters<EnumerateExportsParams>,
    ) -> String {
        info!("Enumerating exports from module: {} for PID: {}", module_name, pid);

        match self.frida.enumerate_exports(&device_id, pid, &module_name).await {
            Ok(exports) => {
                serde_json::to_string(&EnumerateExportsResult { exports })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to enumerate exports: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to enumerate exports: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Enumerate symbols from a module
    #[tool(description = "Enumerate symbols from a module")]
    async fn enumerate_symbols(
        &self,
        Parameters(EnumerateSymbolsParams { device_id, pid, module_name }): Parameters<EnumerateSymbolsParams>,
    ) -> String {
        info!("Enumerating symbols from module: {} for PID: {}", module_name, pid);

        match self.frida.enumerate_symbols(&device_id, pid, &module_name).await {
            Ok(symbols) => {
                serde_json::to_string(&EnumerateSymbolsResult { symbols })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to enumerate symbols: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to enumerate symbols: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    // Memory operation tools

    /// Scan process memory for a pattern
    #[tool(description = "Scan process memory for a byte pattern")]
    async fn scan_memory(
        &self,
        Parameters(ScanMemoryParams { device_id, pid, pattern }): Parameters<ScanMemoryParams>,
    ) -> String {
        info!("Scanning memory for pattern: {} in PID: {}", pattern, pid);

        match self.frida.scan_memory(&device_id, pid, &pattern).await {
            Ok(matches) => {
                serde_json::to_string(&ScanMemoryResult { matches })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to scan memory: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to scan memory: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Read memory at a specific address
    #[tool(description = "Read memory at a specific address")]
    async fn read_memory(
        &self,
        Parameters(ReadMemoryParams { device_id, pid, address, size }): Parameters<ReadMemoryParams>,
    ) -> String {
        info!("Reading memory at address: {} size: {} in PID: {}", address, size, pid);

        match self.frida.read_memory(&device_id, pid, &address, size).await {
            Ok(data) => {
                let hex_data = hex::encode(&data);
                serde_json::to_string(&ReadMemoryResult { data: hex_data })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to read memory: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to read memory: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Write data to memory at a specific address
    #[tool(description = "Write data to memory at a specific address")]
    async fn write_memory(
        &self,
        Parameters(WriteMemoryParams { device_id, pid, address, data }): Parameters<WriteMemoryParams>,
    ) -> String {
        info!("Writing memory at address: {} in PID: {}", address, pid);

        match hex::decode(&data) {
            Ok(data_bytes) => {
                match self.frida.write_memory(&device_id, pid, &address, &data_bytes).await {
                    Ok(_) => {
                        serde_json::to_string(&WriteMemoryResult { success: true })
                            .unwrap_or_else(|_| "Error serializing result".to_string())
                    }
                    Err(e) => {
                        warn!("Failed to write memory: {}", e);
                        serde_json::to_string(&ToolError {
                            error: format!("Failed to write memory: {}", e),
                        }).unwrap_or_else(|_| "Error serializing error".to_string())
                    }
                }
            }
            Err(e) => {
                warn!("Failed to decode hex data: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to decode hex data: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Dump a region of memory
    #[tool(description = "Dump a region of memory to base64")]
    async fn dump_memory(
        &self,
        Parameters(DumpMemoryParams { device_id, pid, address, size }): Parameters<DumpMemoryParams>,
    ) -> String {
        info!("Dumping memory at address: {} size: {} in PID: {}", address, size, pid);

        match self.frida.read_memory(&device_id, pid, &address, size).await {
            Ok(data) => {
                use base64::{Engine as _, engine::general_purpose};
                let base64_data = general_purpose::STANDARD.encode(&data);
                serde_json::to_string(&DumpMemoryResult { data: base64_data })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to dump memory: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to dump memory: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Enumerate memory regions
    #[tool(description = "Enumerate memory regions of a process")]
    async fn enumerate_memory_regions(
        &self,
        Parameters(EnumerateMemoryRegionsParams { device_id, pid }): Parameters<EnumerateMemoryRegionsParams>,
    ) -> String {
        info!("Enumerating memory regions for PID: {} on device: {}", pid, device_id);

        match self.frida.enumerate_memory_regions(&device_id, pid).await {
            Ok(regions) => {
                serde_json::to_string(&EnumerateMemoryRegionsResult { regions })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to enumerate memory regions: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to enumerate memory regions: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    // Advanced analysis tools

    /// Run comprehensive analysis on an Android application
    #[tool(description = "Run comprehensive analysis on an Android application with multiple analysis modules")]
    async fn analyze_android(
        &self,
        Parameters(params): Parameters<tools::analysis::AnalyzeAndroidParams>,
    ) -> String {
        info!("Running comprehensive analysis for PID: {} on device: {}", params.pid, params.device_id);

        match tools::analysis::analyze_android(params).await {
            Ok(result) => {
                serde_json::to_string(&result)
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to run comprehensive analysis: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to run comprehensive analysis: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    // Script injection tools

    /// Inject a Frida script into a process
    #[tool(description = "Inject a Frida script into a process")]
    async fn inject_script(
        &self,
        Parameters(InjectScriptParams { device_id, target, script }): Parameters<InjectScriptParams>,
    ) -> String {
        info!("Injecting script into: {} on device: {}", target, device_id);

        let mut script_to_inject = script.clone();
        if self.config.bypass.auto_inject {
            if let Ok(bypass_script) = load_default_bypass_script(&self.config.bypass.bypass_type) {
                script_to_inject = bypass_script + "\n" + &script_to_inject;
            }
        }

        match self.frida.inject_script(&device_id, &target, &script_to_inject).await {
            Ok(output) => {
                serde_json::to_string(&InjectScriptResult { output })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to inject script: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to inject script: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Execute a Frida script on an attached process
    #[tool(description = "Execute a Frida script on an attached process")]
    async fn execute_script(
        &self,
        Parameters(ExecuteScriptParams { device_id, pid, script }): Parameters<ExecuteScriptParams>,
    ) -> String {
        info!("Executing script on PID: {} on device: {}", pid, device_id);

        match self.frida.execute_script(&device_id, pid, &script).await {
            Ok(output) => {
                serde_json::to_string(&ExecuteScriptResult { output })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to execute script: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to execute script: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// List active Frida hooks
    #[tool(description = "List active Frida hooks in a process")]
    async fn list_hooks(
        &self,
        Parameters(ListHooksParams { device_id, pid }): Parameters<ListHooksParams>,
    ) -> String {
        info!("Listing hooks for PID: {} on device: {}", pid, device_id);

        match self.frida.list_hooks(&device_id, pid).await {
            Ok(hooks) => {
                serde_json::to_string(&ListHooksResult { hooks })
                    .unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to list hooks: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to list hooks: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Trace a function in a module
    #[tool(description = "Trace a specific function in a module")]
    async fn trace_function(
        &self,
        Parameters(TraceFunctionParams { device_id, pid, module, function }): Parameters<TraceFunctionParams>,
    ) -> String {
        info!("Tracing function: {} in module: {} for PID: {}", function, module, pid);

        let trace_script = format!(
            r#"
            if (Java.available) {{
                Java.perform(function() {{
                    console.log("[*] Tracing function: {} in module: {}");
                    try {{
                        var targetModule = Java.use("{}");
                        if (targetModule[{}]) {{
                            Java.use("android.util.Log").i("FridaTrace", "Found function: {}");
                        }} else {{
                            Java.use("android.util.Log").w("FridaTrace", "Function not found: {}");
                        }}
                    }} catch (e) {{
                        console.log("Trace error: " + e);
                    }}
                }});
            }}
            "#,
            function, module, module, function, function, function
        );

        match self.frida.execute_script(&device_id, pid, &trace_script).await {
            Ok(_) => {
                serde_json::to_string(&TraceFunctionResult {
                    success: true,
                    trace_id: format!("trace_{}", Uuid::new_v4()),
                }).unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to trace function: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to trace function: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    /// Monitor API calls
    #[tool(description = "Monitor calls to a specific API function")]
    async fn monitor_api_calls(
        &self,
        Parameters(MonitorApiCallsParams { device_id, pid, api_name }): Parameters<MonitorApiCallsParams>,
    ) -> String {
        info!("Monitoring API calls: {} for PID: {}", api_name, pid);

        let monitor_script = format!(
            r#"
            if (Java.available) {{
                Java.perform(function() {{
                    console.log("[*] Monitoring API calls: {}");
                    try {{
                        var targetFunc = Module.findExportByName(null, "{}");
                        if (targetFunc) {{
                            Interceptor.attach(targetFunc, {{
                                onEnter: function(args) {{
                                    console.log("[API] {} called");
                                }},
                                onLeave: function(retval) {{
                                    console.log("[API] {} returned: " + retval);
                                }}
                            }});
                            console.log("[+] Successfully attached to: {}");
                        }} else {{
                            console.log("[-] Could not find: {}");
                        }}
                    }} catch (e) {{
                        console.log("Monitor error: " + e);
                    }}
                }});
            }}
            "#,
            api_name, api_name, api_name, api_name, api_name, api_name
        );

        match self.frida.execute_script(&device_id, pid, &monitor_script).await {
            Ok(_) => {
                serde_json::to_string(&MonitorApiCallsResult {
                    success: true,
                    monitor_id: format!("monitor_{}", Uuid::new_v4()),
                }).unwrap_or_else(|_| "Error serializing result".to_string())
            }
            Err(e) => {
                warn!("Failed to monitor API calls: {}", e);
                serde_json::to_string(&ToolError {
                    error: format!("Failed to monitor API calls: {}", e),
                }).unwrap_or_else(|_| "Error serializing error".to_string())
            }
        }
    }

    // Session management tools

    /// List active Frida sessions
    #[tool(description = "List all active Frida attachment sessions")]
    async fn list_sessions(
        &self,
        Parameters(ListSessionsParams { device_serial }): Parameters<ListSessionsParams>,
    ) -> String {
        info!("Listing sessions for device: {:?}", device_serial);

        let sessions = self.session_manager.list_sessions(device_serial.as_deref());
        serde_json::to_string(&ListSessionsResult { sessions })
            .unwrap_or_else(|_| "Error serializing result".to_string())
    }

    /// Close a Frida session
    #[tool(description = "Close a specific Frida attachment session")]
    async fn close_session(
        &self,
        Parameters(CloseSessionParams { session_id }): Parameters<CloseSessionParams>,
    ) -> String {
        info!("Closing session: {}", session_id);

        let success = self.session_manager.close_session(&session_id);
        serde_json::to_string(&CloseSessionResult { success })
            .unwrap_or_else(|_| "Error serializing result".to_string())
    }
}

// Server handler implementation with resources support
impl ServerHandler for McpFridaServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder()
                .enable_resources()
                .enable_prompts()
                .build(),
            ..Default::default()
        }
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<McpListResourcesResult, rmcp::ErrorData> {
        info!("Listing resources");

        let resources = vec![
            RawResource::new("frida://scripts", "Frida Scripts")
                .no_annotation(),
            RawResource::new("device://logs", "Device Logs")
                .no_annotation(),
            RawResource::new("config://server", "Server Configuration")
                .no_annotation(),
        ];

        Ok(McpListResourcesResult {
            resources,
            next_cursor: None,
            meta: None,
        })
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, rmcp::ErrorData> {
        info!("Reading resource: {}", request.uri);

        match request.uri.as_str() {
            "frida://scripts" => {
                let scripts_json = serde_json::to_string(&self.config.bypass).unwrap_or_else(|_| "{}".to_string());
                Ok(ReadResourceResult {
                    contents: vec![ResourceContents::text(scripts_json, &request.uri)],
                })
            }
            "device://logs" => {
                let logs = "Device logs would be fetched from connected devices".to_string();
                Ok(ReadResourceResult {
                    contents: vec![ResourceContents::text(logs, &request.uri)],
                })
            }
            "config://server" => {
                let config_json = serde_json::to_string(&self.config).unwrap_or_else(|_| "{}".to_string());
                Ok(ReadResourceResult {
                    contents: vec![ResourceContents::text(config_json, &request.uri)],
                })
            }
            _ => {
                Err(rmcp::ErrorData::resource_not_found(
                    "resource_not_found",
                    Some(serde_json::json!({ "uri": request.uri })),
                ))
            }
        }
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, rmcp::ErrorData> {
        info!("Listing resource templates");

        let templates = vec![];

        Ok(ListResourceTemplatesResult {
            resource_templates: templates,
            next_cursor: None,
            meta: None,
        })
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, rmcp::ErrorData> {
        info!("Listing prompts");

        let prompts = vec![
            rmcp::model::Prompt {
                name: "analyze_app".to_string(),
                title: Some("Analyze Android App".to_string()),
                description: Some("Comprehensive Android app security analysis workflow".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "package_name".to_string(),
                        title: Some("Package Name".to_string()),
                        description: Some("Package name of the app to analyze".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "device_serial".to_string(),
                        title: Some("Device Serial".to_string()),
                        description: Some("Device serial number".to_string()),
                        required: Some(true),
                    },
                ]),
                icons: None,
                meta: None,
            },
            rmcp::model::Prompt {
                name: "hook_network".to_string(),
                title: Some("Hook Network Traffic".to_string()),
                description: Some("Monitor and analyze network traffic from an Android app".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "package_name".to_string(),
                        title: Some("Package Name".to_string()),
                        description: Some("Package name to monitor".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "device_serial".to_string(),
                        title: Some("Device Serial".to_string()),
                        description: Some("Device serial number".to_string()),
                        required: Some(true),
                    },
                ]),
                icons: None,
                meta: None,
            },
            rmcp::model::Prompt {
                name: "bypass_ssl".to_string(),
                title: Some("Bypass SSL Pinning".to_string()),
                description: Some("Bypass SSL certificate pinning in an Android app".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "package_name".to_string(),
                        title: Some("Package Name".to_string()),
                        description: Some("Package name to bypass SSL for".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "device_serial".to_string(),
                        title: Some("Device Serial".to_string()),
                        description: Some("Device serial number".to_string()),
                        required: Some(true),
                    },
                ]),
                icons: None,
                meta: None,
            },
        ];

        Ok(ListPromptsResult {
            prompts,
            next_cursor: None,
            meta: None,
        })
    }

    async fn get_prompt(
        &self,
        request: rmcp::model::GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResult, rmcp::ErrorData> {
        info!("Getting prompt: {}", request.name);

        let messages = match request.name.as_str() {
            "analyze_app" => {
                let package_name = request.arguments
                    .and_then(|args| args.get("package_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("com.example.app");
                let device_serial = request.arguments
                    .and_then(|args| args.get("device_serial"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("emulator-5554");

                self.analyze_app(Parameters(AnalyzeAppParams {
                    package_name: package_name.to_string(),
                    device_serial: device_serial.to_string(),
                }))
            }
            "hook_network" => {
                let package_name = request.arguments
                    .and_then(|args| args.get("package_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("com.example.app");
                let device_serial = request.arguments
                    .and_then(|args| args.get("device_serial"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("emulator-5554");

                self.hook_network(Parameters(HookNetworkParams {
                    package_name: package_name.to_string(),
                    device_serial: device_serial.to_string(),
                }))
            }
            "bypass_ssl" => {
                let package_name = request.arguments
                    .and_then(|args| args.get("package_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("com.example.app");
                let device_serial = request.arguments
                    .and_then(|args| args.get("device_serial"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("emulator-5554");

                self.bypass_ssl(Parameters(BypassSslParams {
                    package_name: package_name.to_string(),
                    device_serial: device_serial.to_string(),
                }))
            }
            _ => {
                return Err(rmcp::ErrorData::invalid_params(
                    "prompt_not_found",
                    Some(serde_json::json!({ "name": request.name })),
                ))
            }
        };

        Ok(GetPromptResult {
            messages,
            description: None,
        })
    }
}

/// Start the RMCP server
///
/// This function initializes the RMCP server with stdio transport
/// and starts listening for MCP protocol messages.
pub async fn run_rmcp_server(config: Config) -> Result<()> {
    info!("Starting RMCP server");

    // Create server instance
    let server = McpFridaServer::new(config);

    // Create stdio transport
    let (stdin, stdout) = (tokio::io::stdin(), tokio::io::stdout());
    let transport = (stdin, stdout);

    // Serve the server
    let server_handle = server.serve(transport).await?;

    info!("RMCP server started");

    // Wait for server shutdown
    let quit_reason = server_handle.waiting().await?;
    info!("RMCP server stopped: {:?}", quit_reason);

    Ok(())
}
