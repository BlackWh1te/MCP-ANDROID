//! MCP Frida Android Server
//!
//! A Model Context Protocol (MCP) server that provides Frida-based dynamic instrumentation
//! and memory inspection capabilities for Android devices via ADB.
//!
//! ## Features
//! - Device management via ADB
//! - Process attachment and spawning
//! - Memory scanning, reading, and writing
//! - Frida script injection and execution
//! - Session management for long-running attachments
//! - Rate limiting for memory operations
//! - Comprehensive metrics collection

mod config;
mod server;
#[cfg(not(feature = "legacy_only"))]
mod rmcp_server;
mod adb;
mod frida;
mod tools;
mod error;
mod session;
mod rate_limiter;
mod middleware;
mod metrics;
mod auth;

use anyhow::Result;
use tracing::{info, error};
use tracing_subscriber::{EnvFilter, fmt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with environment-based log level filtering
    let filter = EnvFilter::from_default_env()
        .add_directive(tracing::Level::INFO.into());
    fmt()
        .with_env_filter(filter)
        .init();

    info!("Starting MCP Frida Android Server");

    // Load and validate configuration
    let config = config::load_config()?;
    info!("Configuration loaded: {:?}", config);

    // Check if legacy server should be used (via feature flag)
    #[cfg(feature = "legacy_only")]
    {
        info!("Using legacy HTTP server implementation");
        // Start legacy MCP server with graceful shutdown support
        match server::run(config).await {
            Ok(_) => {
                info!("Server started successfully");
                Ok(())
            }
            Err(e) => {
                error!("Failed to start server: {}", e);
                Err(e)
            }
        }
    }

    #[cfg(not(feature = "legacy_only"))]
    {
        info!("Using RMCP server implementation (default)");
        // Start RMCP server
        match rmcp_server::run_rmcp_server(config).await {
            Ok(_) => {
                info!("RMCP server started successfully");
                Ok(())
            }
            Err(e) => {
                error!("Failed to start RMCP server: {}", e);
                Err(e)
            }
        }
    }
}
