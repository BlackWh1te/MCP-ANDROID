# MCP Frida Android Server

A Rust-based MCP (Model Context Protocol) server that integrates Frida for dynamic instrumentation and memory inspection on Android devices and emulators via ADB.

## Overview

This server provides a powerful interface for AI agents and developers to interact with Android devices through the Model Context Protocol. It bridges MCP clients with Frida's dynamic instrumentation capabilities, enabling advanced reverse engineering, security analysis, and debugging workflows.

## Features

### Core Functionality

- **Device Management**: List, connect to, and manage Android devices and emulators via ADB
- **Emulator Support**: Native support for MuMu and other Android emulators
- **Process Management**: List, attach to, and spawn processes with filtering capabilities
- **Memory Inspection**: Scan, read, write, and dump process memory with validation and safety checks
- **Memory Region Analysis**: Enumerate and analyze memory regions with improved reliability
- **Script Injection**: Inject and execute Frida scripts for dynamic analysis
- **Function Tracing**: Trace function calls and monitor API usage
- **Hook Management**: List and manage active Frida hooks

### Enhanced Reliability

- **Automatic Retry Logic**: Transient failures are automatically retried with exponential backoff
- **Enhanced Error Messages**: Actionable error messages with specific guidance for troubleshooting
- **Input Validation**: Comprehensive validation of all input parameters to prevent errors
- **Connection Stability**: Improved device connection checking with detailed status information
- **Memory Safety**: Size limits and validation to prevent resource exhaustion

### Production-Ready Features

- **Health Monitoring**: Built-in health check endpoints
- **Metrics Collection**: Comprehensive performance monitoring and metrics
- **Session Management**: Track and manage Frida attachment sessions
- **Rate Limiting**: Protect against abuse with configurable rate limits
- **Graceful Shutdown**: Clean shutdown with signal handling
- **Structured Logging**: Request ID tracking for better observability
- **Configuration Validation**: Automatic validation of configuration values
- **Custom Error Types**: Comprehensive error handling and reporting
- **Authentication**: JWT-based authentication support

### Bypass Scripts

- **Emulator Detection Bypass**: Automatically bypass emulator detection checks
- **Root Detection Bypass**: Circumvent root detection mechanisms
- **Combined Bypass**: Multi-layered bypass for enhanced stealth
- **Auto-Injection**: Automatically inject bypass scripts on app attachment

## Architecture

```
┌─────────────────┐
│   MCP Client    │
└────────┬────────┘
         │ MCP Protocol
┌────────▼────────┐
│  MCP Server     │
│  (Rust + rmcp)  │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    │         │             │
┌───▼───┐ ┌──▼───────┐ ┌───▼──────┐
│ ADB   │ │  Frida   │ │  Tools   │
│ Bridge│ │  Bridge  │ │  Layer   │
└───┬───┘ └───┬──────┘ └──────────┘
    │         │
    │         │
┌───▼────┐ ┌─▼──────────┐
│Android │ │ Frida CLI  │
│Device  │ │ / Server   │
└────────┘ └────────────┘
```

## Prerequisites

- Rust 1.70 or later
- Android SDK with ADB installed
- Frida tools installed on your system
- Android device or emulator with USB debugging enabled
- Device/emulator may need to be rooted for certain operations

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd MCPforEmulator
```

### 2. Build the project

```bash
cargo build --release
```

### 3. Install Frida tools

Download and install Frida from [frida.re](https://frida.re/docs/installation/)

### 4. Set up ADB

Ensure ADB is in your PATH or configure the path in `config.toml`

## Configuration

Create a `config.toml` file in the project root:

```toml
[server]
host = "127.0.0.1"
port = 3000

[adb]
# Path to adb executable. Leave empty to use system PATH
# Example Windows: "C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe"
# Example Linux/Mac: "/home/yourname/Android/Sdk/platform-tools/adb"
path = "adb"
timeout_seconds = 30

# MuMu Emulator Configuration
[mumu]
enabled = true
host = "127.0.0.1"
port = 7555

[frida]
# Path to frida executable. Leave empty to use system PATH
path = "frida"
device_port = 27042
script_timeout_seconds = 60

# Default Bypass Scripts
[bypass]
# Automatically inject bypass scripts on app attach
auto_inject = true
# Types: "emulator", "root", "combined"
bypass_type = "combined"
```

## Usage

### Starting the Server

```bash
# Start RMCP server (default)
cargo run

# Start legacy HTTP server
USE_LEGACY_SERVER=true cargo run
```

### RMCP Server (Recommended)

The server uses the official MCP SDK (rmcp) by default and communicates via stdio:

```bash
# With MCP client (e.g., Claude Desktop)
# Configure in MCP client settings:
# {
#   "mcpServers": {
#     "frida-android": {
#       "command": "cargo",
#       "args": ["run", "--release"]
#     }
#   }
# }
```

### Legacy HTTP Server

For compatibility with HTTP-based MCP clients:

```bash
# Health check
curl http://127.0.0.1:3000/health

# Metrics
curl http://127.0.0.1:3000/metrics

# List tools
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

## MCP Tools

The server exposes the following MCP tools:

### Device Management

- **list_devices**: List all connected Android devices and emulators
- **get_device_info**: Get detailed information about a specific device
- **check_connection**: Check if a device is connected and responsive

### Process Management

- **list_processes**: List running processes on a device
- **attach_process**: Attach Frida to a running process
- **spawn_process**: Spawn a new process with Frida attached

### Memory Inspection

- **scan_memory**: Scan process memory for a pattern
- **read_memory**: Read memory at a specific address
- **write_memory**: Write data to memory at a specific address
- **dump_memory**: Dump a region of memory
- **enumerate_memory_regions**: List all memory regions of a process

### Script Execution

- **inject_script**: Inject a Frida script into a process
- **execute_script**: Execute a Frida script on an attached process
- **list_hooks**: List active Frida hooks
- **trace_function**: Trace function calls in a module
- **monitor_api_calls**: Monitor API calls to a specific function

### Bypass Operations

- **bypass_emulator_detection**: Bypass emulator detection checks
- **bypass_root_detection**: Bypass root detection mechanisms
- **inject_combined_bypass**: Inject comprehensive bypass scripts

## Example Usage

### Using MCP Client

```json
// List devices
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_devices",
    "arguments": {}
  },
  "id": 1
}

// List processes
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_processes",
    "arguments": {
      "serial": "device_serial_number"
    }
  },
  "id": 2
}

// Attach to process with bypass
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "attach_process",
    "arguments": {
      "device_id": "device_serial_number",
      "process_name": "com.example.app",
      "inject_bypass": true
    }
  },
  "id": 3
}
```

## Tools Directory

The `tools/` directory contains comprehensive utilities and Frida scripts for Android reverse engineering and device management.

### Frida Scripts

Ready-to-use Frida instrumentation scripts for common reverse engineering tasks:

- **Native/Java method hooking** - Intercept function calls
- **Memory pattern search** - Find byte patterns in memory
- **SSL pinning bypass** - Intercept HTTPS traffic
- **Network monitoring** - Log HTTP/HTTPS operations
- **File operations** - Monitor file I/O
- **Encryption hooking** - Capture encryption operations
- **Database monitoring** - Log SQL queries
- **Intent monitoring** - Track Android intents
- **Anti-debug bypass** - Bypass anti-debugging checks
- **String dumping** - Extract strings from memory

### Utility Scripts

Device management utilities:

- **test_connection.sh** - Test ADB/Frida setup
- **setup_frida.sh** - Automated Frida server installation
- **config_loader.js** - Configuration loader utility

### Examples

Comprehensive examples demonstrating various workflows:

- **mcp_client.py** - Python MCP client example
- **curl_examples.sh** - curl-based API examples
- **frida_scripts.md** - Frida script documentation
- **bypass_scripts.md** - Bypass script documentation

## Development

### Project Structure

```
src/
├── main.rs           # Server entry point
├── config.rs         # Configuration management
├── server.rs         # Legacy HTTP MCP server
├── rmcp_server.rs    # RMCP server implementation
├── adb.rs            # ADB bridge
├── frida.rs          # Frida integration
├── error.rs          # Custom error types
├── session.rs        # Session management
├── rate_limiter.rs   # Rate limiting
├── middleware.rs     # HTTP middleware
├── metrics.rs        # Metrics collection
├── auth.rs           # Authentication
└── tools/            # MCP tool implementations
    ├── device.rs     # Device management tools
    ├── process.rs    # Process management tools
    ├── memory.rs     # Memory inspection tools
    └── script.rs     # Script injection tools

tools/
├── frida_scripts/    # Ready-to-use Frida instrumentation scripts
├── examples/         # Example scripts and demonstrations
├── config.json       # Configuration file for tools
├── config_loader.js  # Configuration loader utility
├── setup_frida.sh    # Automated Frida server installation
└── test_connection.sh # Test ADB/Frida setup
```

### Building

```bash
cargo build
cargo build --release
```

### Testing

```bash
cargo test
```

## Security Considerations

- **Device Authentication**: Ensure only trusted devices are connected
- **Memory Access**: Memory operations can crash processes; use with caution
- **Script Injection**: Arbitrary script execution is powerful; validate scripts
- **ADB Access**: ADB provides broad device access; secure your ADB setup
- **Root Requirements**: Some features may require rooted devices
- **Rate Limiting**: Memory operations are rate-limited to prevent abuse
- **Session Management**: Active sessions are tracked and can be cleaned up
- **Authentication**: Use JWT authentication in production environments

## Production Features

### Health Monitoring

```bash
curl http://127.0.0.1:3000/health
```

### Metrics Collection

Comprehensive metrics are available via `/metrics` endpoint:

- Total request count
- Success/failure rates
- Tool usage statistics
- Average request duration
- Server uptime

### Graceful Shutdown

The server supports graceful shutdown via:

- Ctrl+C signal
- SIGTERM (Unix systems)
- 5-second grace period for connection cleanup

### Configuration Validation

All configuration values are validated on startup:

- Port ranges (1-65535)
- Timeout limits
- Enum value validation
- Clear error messages for invalid values

### Rate Limiting

Memory operations are rate-limited per device:

- Default: 50 requests per minute per device
- Configurable in code
- Prevents resource exhaustion
- Automatic cleanup of expired entries

## Troubleshooting

### ADB not found

Ensure ADB is in your PATH or configure the full path in `config.toml`

### Device not detected

- Check USB debugging is enabled on the device
- Verify device is connected and authorized
- Try `adb devices` to see if ADB can detect the device

### Emulator connection issues

- Verify emulator is running
- Check emulator ADB port (default: 5555)
- For MuMu: ensure port 7555 is configured
- Check firewall settings

### Frida connection fails

- Ensure Frida server is installed on the device/emulator
- Check port forwarding is working
- Verify device/emulator compatibility with Frida

### Memory operations fail

- Some operations may require rooted device/emulator
- Check process permissions
- Verify memory addresses are valid

## Limitations

- **Frida Rust Bindings**: Uses subprocess approach for Frida integration
- **Device Rooting**: Some Frida features require rooted devices
- **Windows ADB**: Special handling required for Windows ADB paths
- **Performance**: Memory scanning can be slow on large processes
- **Compatibility**: Different Android versions may have varying ADB implementations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [Frida](https://frida.re/) - Dynamic instrumentation toolkit
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI agent communication protocol
- [rmcp](https://github.com/jule-pro/rmcp) - Rust MCP SDK
- [Axum](https://github.com/tokio-rs/axum) - Web framework for Rust
