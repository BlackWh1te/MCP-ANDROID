//! MCP server implementation
//!
//! This module implements the HTTP server that handles MCP protocol requests,
//! including tool listing, tool execution, and session management.

use anyhow::Result;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tower_http::cors::CorsLayer;
use tracing::{info, error, warn};

use crate::config::Config;
use crate::tools::*;
use crate::error::McpError;
use crate::session::SessionManager;
use crate::rate_limiter::RateLimiter;
use crate::middleware::request_id_middleware;
use crate::metrics::MetricsCollector;

/// Application state shared across all request handlers
#[derive(Clone)]
struct AppState {
    /// Server configuration
    config: Config,
    /// Session manager for Frida attachments
    session_manager: SessionManager,
    /// Rate limiter for memory operations
    memory_rate_limiter: RateLimiter,
    /// Metrics collector for monitoring
    metrics: MetricsCollector,
}

/// MCP protocol request structure
#[derive(Debug, Deserialize)]
struct McpRequest {
    /// JSON-RPC version (always "2.0")
    jsonrpc: String,
    /// Method name (e.g., "tools/list", "tools/call")
    method: String,
    /// Method parameters
    params: Option<serde_json::Value>,
    /// Request ID for correlation
    id: Option<serde_json::Value>,
}

/// MCP protocol response structure
#[derive(Debug, Serialize)]
struct McpResponse {
    /// JSON-RPC version (always "2.0")
    jsonrpc: String,
    /// Result data (present on success)
    result: Option<serde_json::Value>,
    /// Error information (present on failure)
    error: Option<McpProtocolError>,
    /// Request ID for correlation
    id: Option<serde_json::Value>,
}

/// MCP protocol error structure
#[derive(Debug, Serialize)]
struct McpProtocolError {
    /// Error code (MCP protocol specific)
    code: i32,
    /// Human-readable error message
    message: String,
}

/// Tool definition for MCP protocol
#[derive(Debug, Serialize)]
struct Tool {
    /// Tool name
    name: String,
    /// Tool description
    description: String,
    /// JSON schema for tool input parameters
    input_schema: serde_json::Value,
}

/// Start the MCP server with the given configuration
///
/// This function initializes all server components and starts the HTTP server
/// with graceful shutdown support.
pub async fn run(config: Config) -> Result<()> {
    let addr = format!("{}:{}", config.server.host, config.server.port);
    let session_manager = SessionManager::new();
    // Rate limit memory operations: 50 requests per minute per device
    let memory_rate_limiter = RateLimiter::new(50, 60);
    let metrics = MetricsCollector::new();
    let state = Arc::new(AppState {
        config,
        session_manager,
        memory_rate_limiter,
        metrics,
    });

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health_check))
        .route("/metrics", get(metrics_endpoint))
        .route("/mcp", post(handle_mcp_request))
        .layer(axum::middleware::from_fn(request_id_middleware))
        .layer(CorsLayer::very_permissive())
        .with_state(state);
    info!("Starting MCP server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;

    // Set up graceful shutdown
    let handle = axum::serve(listener, app).with_graceful_shutdown(shutdown_signal());

    info!("Server running, press Ctrl+C to stop");
    handle.await?;

    info!("Server shutdown complete");
    Ok(())
}

/// Wait for shutdown signal (Ctrl+C or SIGTERM)
///
/// This function listens for shutdown signals and initiates graceful shutdown
/// when received. It provides a 5-second grace period for connections to close.
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, initiating graceful shutdown");
        },
        _ = terminate => {
            info!("Received SIGTERM, initiating graceful shutdown");
        },
    }

    // Give connections time to close
    tokio::time::sleep(Duration::from_secs(5)).await;
}

async fn root() -> &'static str {
    "MCP Frida Android Server - Running"
}

async fn health_check() -> ResponseJson<serde_json::Value> {
    ResponseJson(serde_json::json!({
        "status": "healthy",
        "server": "mcp-frida-android",
        "version": "0.1.0",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn metrics_endpoint(State(state): State<Arc<AppState>>) -> ResponseJson<serde_json::Value> {
    let metrics = state.metrics.get_metrics().await;
    let success_rate = state.metrics.get_success_rate().await;
    let uptime = state.metrics.get_uptime().await;

    ResponseJson(serde_json::json!({
        "metrics": metrics,
        "success_rate": success_rate,
        "uptime_seconds": uptime.as_secs()
    }))
}

async fn handle_mcp_request(
    State(state): State<Arc<AppState>>,
    Json(req): Json<McpRequest>,
) -> Result<ResponseJson<McpResponse>, (StatusCode, String)> {
    info!("Received MCP request: method={}, id={:?}", req.method, req.id);

    let start_time = state.metrics.record_request_start().await;

    let result = match req.method.as_str() {
        "tools/list" => handle_list_tools().await,
        "tools/call" => handle_tool_call(req.params, state.clone()).await,
        "initialize" => handle_initialize().await,
        _ => {
            warn!("Unknown MCP method: {}", req.method);
            Err(McpError::InvalidInput(format!("Unknown method: {}", req.method)).to_string())
        }
    };

    let duration = start_time.elapsed();

    match result {
        Ok(value) => {
            info!("MCP request successful: method={}", req.method);
            state.metrics.record_request_success(duration, None).await;
            Ok(ResponseJson(McpResponse {
                jsonrpc: "2.0".to_string(),
                result: Some(value),
                error: None,
                id: req.id,
            }))
        }
        Err(err) => {
            error!("MCP request failed: method={}, error={}", req.method, err);
            state.metrics.record_request_failure(duration, None).await;
            Ok(ResponseJson(McpResponse {
                jsonrpc: "2.0".to_string(),
                result: None,
                error: Some(McpProtocolError {
                    code: -32600,
                    message: err,
                }),
                id: req.id,
            }))
        }
    }
}

async fn handle_initialize() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "mcp-frida-android",
            "version": "0.1.0"
        }
    }))
}

async fn handle_list_tools() -> Result<serde_json::Value, String> {
    let tools = vec![
        Tool {
            name: "list_devices".to_string(),
            description: "List all connected Android devices via ADB".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                }
            }),
        },
        Tool {
            name: "get_device_info".to_string(),
            description: "Get detailed information about a specific device".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial"]
            }),
        },
        Tool {
            name: "check_connection".to_string(),
            description: "Check if a device is connected and responsive".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial"]
            }),
        },
        Tool {
            name: "install_apk".to_string(),
            description: "Install an APK file on a device".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "apk_path": {
                        "type": "string",
                        "description": "Local path to the APK file"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial", "apk_path"]
            }),
        },
        Tool {
            name: "uninstall_package".to_string(),
            description: "Uninstall a package from a device".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "package_name": {
                        "type": "string",
                        "description": "Package name to uninstall"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial", "package_name"]
            }),
        },
        Tool {
            name: "list_processes".to_string(),
            description: "List running processes on a device".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial"]
            }),
        },
        Tool {
            name: "attach_process".to_string(),
            description: "Attach Frida to a running process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "target": {
                        "type": "string",
                        "description": "Process name or PID"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial", "target"]
            }),
        },
        Tool {
            name: "spawn_process".to_string(),
            description: "Spawn a new process with Frida attached".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "serial": {
                        "type": "string",
                        "description": "Device serial number"
                    },
                    "package": {
                        "type": "string",
                        "description": "Package name to spawn"
                    },
                    "adb_path": {
                        "type": "string",
                        "description": "Optional path to adb executable"
                    }
                },
                "required": ["serial", "package"]
            }),
        },
        Tool {
            name: "scan_memory".to_string(),
            description: "Scan process memory for a pattern".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Hex pattern to search for"
                    }
                },
                "required": ["device_id", "pid", "pattern"]
            }),
        },
        Tool {
            name: "read_memory".to_string(),
            description: "Read memory at a specific address".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "address": {
                        "type": "string",
                        "description": "Memory address"
                    },
                    "size": {
                        "type": "integer",
                        "description": "Number of bytes to read"
                    }
                },
                "required": ["device_id", "pid", "address", "size"]
            }),
        },
        Tool {
            name: "write_memory".to_string(),
            description: "Write data to memory at a specific address".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "address": {
                        "type": "string",
                        "description": "Memory address"
                    },
                    "data": {
                        "type": "string",
                        "description": "Hex-encoded data to write"
                    }
                },
                "required": ["device_id", "pid", "address", "data"]
            }),
        },
        Tool {
            name: "dump_memory".to_string(),
            description: "Dump a region of memory".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "address": {
                        "type": "string",
                        "description": "Memory address"
                    },
                    "size": {
                        "type": "integer",
                        "description": "Number of bytes to dump"
                    }
                },
                "required": ["device_id", "pid", "address", "size"]
            }),
        },
        Tool {
            name: "enumerate_memory_regions".to_string(),
            description: "List all memory regions of a process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    }
                },
                "required": ["device_id", "pid"]
            }),
        },
        Tool {
            name: "inject_script".to_string(),
            description: "Inject a Frida script into a process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "target": {
                        "type": "string",
                        "description": "Process name or PID"
                    },
                    "script": {
                        "type": "string",
                        "description": "Frida script code"
                    }
                },
                "required": ["device_id", "target", "script"]
            }),
        },
        Tool {
            name: "execute_script".to_string(),
            description: "Execute a Frida script on an attached process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "script": {
                        "type": "string",
                        "description": "Frida script code"
                    }
                },
                "required": ["device_id", "pid", "script"]
            }),
        },
        Tool {
            name: "list_hooks".to_string(),
            description: "List active Frida hooks".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    }
                },
                "required": ["device_id", "pid"]
            }),
        },
        Tool {
            name: "trace_function".to_string(),
            description: "Trace function calls in a module".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "module": {
                        "type": "string",
                        "description": "Module name"
                    },
                    "function": {
                        "type": "string",
                        "description": "Function name"
                    }
                },
                "required": ["device_id", "pid", "module", "function"]
            }),
        },
        Tool {
            name: "monitor_api_calls".to_string(),
            description: "Monitor API calls to a specific function".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "api_name": {
                        "type": "string",
                        "description": "API function name"
                    }
                },
                "required": ["device_id", "pid", "api_name"]
            }),
        },
        Tool {
            name: "enumerate_threads".to_string(),
            description: "List all threads in a process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    }
                },
                "required": ["device_id", "pid"]
            }),
        },
        Tool {
            name: "enumerate_modules".to_string(),
            description: "List all loaded modules in a process".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    }
                },
                "required": ["device_id", "pid"]
            }),
        },
        Tool {
            name: "enumerate_exports".to_string(),
            description: "List all exports in a module".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "module_name": {
                        "type": "string",
                        "description": "Module name"
                    }
                },
                "required": ["device_id", "pid", "module_name"]
            }),
        },
        Tool {
            name: "enumerate_symbols".to_string(),
            description: "List all symbols in a module".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "device_id": {
                        "type": "string",
                        "description": "Device ID"
                    },
                    "pid": {
                        "type": "integer",
                        "description": "Process ID"
                    },
                    "module_name": {
                        "type": "string",
                        "description": "Module name"
                    }
                },
                "required": ["device_id", "pid", "module_name"]
            }),
        },
        Tool {
            name: "list_sessions".to_string(),
            description: "List all active Frida sessions".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        Tool {
            name: "close_session".to_string(),
            description: "Close a specific Frida session".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "Session ID to close"
                    }
                },
                "required": ["session_id"]
            }),
        },
    ];

    Ok(serde_json::json!({ "tools": tools }))
}

async fn handle_tool_call(
    params: Option<serde_json::Value>,
    _state: Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let params = params.ok_or_else(|| {
        error!("Missing params in tool call");
        "Missing params".to_string()
    })?;
    let tool_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            error!("Missing tool name in params");
            "Missing tool name".to_string()
        })?;

    let arguments = params.get("arguments").ok_or_else(|| {
        error!("Missing arguments in params");
        "Missing arguments".to_string()
    })?;

    info!("Executing tool: {}", tool_name);

    match tool_name {
        "list_devices" => {
            let args: device::ListDevicesParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = device::list_devices(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "get_device_info" => {
            let args: device::GetDeviceInfoParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = device::get_device_info(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "check_connection" => {
            let args: device::CheckConnectionParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = device::check_connection(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "install_apk" => {
            let args: device::InstallApkParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = device::install_apk(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "uninstall_package" => {
            let args: device::UninstallPackageParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = device::uninstall_package(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "list_processes" => {
            let args: process::ListProcessesParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::list_processes(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "attach_process" => {
            let args: process::AttachProcessParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::attach_process(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "spawn_process" => {
            let args: process::SpawnProcessParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::spawn_process(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "scan_memory" => {
            let args: memory::ScanMemoryParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            // Apply rate limiting
            let rate_limit_key = format!("memory_{}", args.device_id);
            _state.memory_rate_limiter.check_rate_limit(&rate_limit_key).await
                .map_err(|e| format!("Rate limit error: {}", e))?;
            let result = memory::scan_memory(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "read_memory" => {
            let args: memory::ReadMemoryParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            // Apply rate limiting
            let rate_limit_key = format!("memory_{}", args.device_id);
            _state.memory_rate_limiter.check_rate_limit(&rate_limit_key).await
                .map_err(|e| format!("Rate limit error: {}", e))?;
            let result = memory::read_memory(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "write_memory" => {
            let args: memory::WriteMemoryParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            // Apply rate limiting
            let rate_limit_key = format!("memory_{}", args.device_id);
            _state.memory_rate_limiter.check_rate_limit(&rate_limit_key).await
                .map_err(|e| format!("Rate limit error: {}", e))?;
            let result = memory::write_memory(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "dump_memory" => {
            let args: memory::DumpMemoryParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            // Apply rate limiting
            let rate_limit_key = format!("memory_{}", args.device_id);
            _state.memory_rate_limiter.check_rate_limit(&rate_limit_key).await
                .map_err(|e| format!("Rate limit error: {}", e))?;
            let result = memory::dump_memory(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "enumerate_memory_regions" => {
            let args: memory::EnumerateMemoryRegionsParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = memory::enumerate_memory_regions(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "inject_script" => {
            let args: script::InjectScriptParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = script::inject_script(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "execute_script" => {
            let args: script::ExecuteScriptParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = script::execute_script(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "list_hooks" => {
            let args: script::ListHooksParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = script::list_hooks(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "trace_function" => {
            let args: script::TraceFunctionParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = script::trace_function(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "monitor_api_calls" => {
            let args: script::MonitorApiCallsParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = script::monitor_api_calls(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "enumerate_threads" => {
            let args: process::EnumerateThreadsParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::enumerate_threads(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "enumerate_modules" => {
            let args: process::EnumerateModulesParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::enumerate_modules(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "enumerate_exports" => {
            let args: process::EnumerateExportsParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::enumerate_exports(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "enumerate_symbols" => {
            let args: process::EnumerateSymbolsParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            let result = process::enumerate_symbols(args).await?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "list_sessions" => {
            let sessions = _state.session_manager.list_sessions().await;
            Ok(serde_json::json!({ "sessions": sessions }))
        }
        "close_session" => {
            #[derive(Deserialize)]
            struct CloseSessionParams {
                session_id: String,
            }
            let args: CloseSessionParams = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments: {}", e))?;
            _state.session_manager.close_session(&args.session_id).await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "success": true, "message": "Session closed" }))
        }
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}
