use thiserror::Error;

/// Custom error types for the MCP Frida Android Server
#[derive(Error, Debug)]
pub enum McpError {
    /// ADB-related errors
    #[error("ADB error: {0}")]
    Adb(String),

    /// Frida-related errors
    #[error("Frida error: {0}")]
    Frida(String),

    /// Device not found
    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    /// Process not found
    #[error("Process not found: {0}")]
    ProcessNotFound(String),

    /// Memory operation error
    #[error("Memory operation failed: {0}")]
    MemoryError(String),

    /// Script execution error
    #[error("Script execution failed: {0}")]
    ScriptError(String),

    /// Configuration error
    #[error("Configuration error: {0}")]
    ConfigError(String),

    /// Timeout error
    #[error("Operation timed out: {0}")]
    Timeout(String),

    /// Invalid input
    #[error("Invalid input: {0}")]
    InvalidInput(String),

    /// Permission error
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON parsing error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Generic error
    #[error("{0}")]
    Generic(String),
}

impl McpError {
    /// Convert MCP error to MCP protocol error code
    pub fn to_mcp_code(&self) -> i32 {
        match self {
            McpError::DeviceNotFound(_) => -32602,
            McpError::ProcessNotFound(_) => -32602,
            McpError::InvalidInput(_) => -32602,
            McpError::PermissionDenied(_) => -32603,
            McpError::Timeout(_) => -32603,
            McpError::Adb(_) => -32603,
            McpError::Frida(_) => -32603,
            McpError::MemoryError(_) => -32603,
            McpError::ScriptError(_) => -32603,
            McpError::ConfigError(_) => -32603,
            McpError::Io(_) => -32603,
            McpError::Json(_) => -32700,
            McpError::Generic(_) => -32603,
        }
    }

    /// Get error category for logging
    pub fn category(&self) -> &'static str {
        match self {
            McpError::Adb(_) => "adb",
            McpError::Frida(_) => "frida",
            McpError::DeviceNotFound(_) => "device",
            McpError::ProcessNotFound(_) => "process",
            McpError::MemoryError(_) => "memory",
            McpError::ScriptError(_) => "script",
            McpError::ConfigError(_) => "config",
            McpError::Timeout(_) => "timeout",
            McpError::InvalidInput(_) => "input",
            McpError::PermissionDenied(_) => "permission",
            McpError::Io(_) => "io",
            McpError::Json(_) => "json",
            McpError::Generic(_) => "generic",
        }
    }
}

/// Result type alias for MCP operations
pub type Result<T> = std::result::Result<T, McpError>;

/// Convert anyhow::Error to McpError
impl From<anyhow::Error> for McpError {
    fn from(err: anyhow::Error) -> Self {
        McpError::Generic(err.to_string())
    }
}
