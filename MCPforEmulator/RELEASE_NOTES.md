# MCP Frida Android Server v0.1.0 - Windows Release

## Overview

This is the first Windows release of the MCP Frida Android Server, a Rust-based Model Context Protocol (MCP) server that integrates Frida for dynamic instrumentation and memory inspection on Android devices and emulators via ADB.

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

### Advanced Analysis

- **Comprehensive App Analysis**: Deep analysis of Android applications with multiple analysis modules
- **Security Analysis**: Anti-debug, root detection, emulator detection, and SSL pinning analysis
- **Network Traffic Monitoring**: Monitor HTTP/HTTPS operations and detect suspicious domains
- **File System Monitoring**: Track file access patterns and detect sensitive file access
- **Encryption Analysis**: Monitor cryptographic operations and detect encryption libraries
- **String Extraction**: Extract URLs, API keys, and credentials from memory
- **Memory Analysis**: Analyze memory regions and detect suspicious patterns

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
- **Authentication**: JWT-based authentication support

## Installation

### Windows (This Release)

1. Download `mcp-frida-android.exe` from the release assets
2. Place the executable in your desired location
3. Configure `config.toml` with your ADB and Frida paths
4. Run the executable:
   ```bash
   mcp-frida-android.exe
   ```

### Prerequisites

- Windows 10 or later
- Android device or emulator with USB debugging enabled
- ADB (Android Debug Bridge) installed and in PATH
- Frida tools installed (`pip install frida-tools`)

## Configuration

The server uses a `config.toml` file for configuration. Example:

```toml
[adb]
path = "adb"  # Path to ADB executable

[frida]
server_path = "frida"  # Path to Frida server
device_port = 27042
script_timeout_seconds = 30

[server]
host = "127.0.0.1"
port = 3000

[bypass]
auto_inject = true
bypass_type = "comprehensive"
```

## Usage

### Starting the Server

```bash
# Start the legacy HTTP server
mcp-frida-android.exe
```

The server will start on `http://127.0.0.1:3000` by default.

### MCP Client Configuration

For use with MCP clients (e.g., Claude Desktop), configure:

```json
{
  "mcpServers": {
    "frida-android": {
      "command": "path/to/mcp-frida-android.exe"
    }
  }
}
```

## Build Instructions

To build from source:

```bash
# Build with legacy HTTP server (default, recommended)
cargo build --release

# Build with RMCP server (experimental, has API compatibility issues)
cargo build --release --features rmcp

# The executable will be in target/release/mcp-frida-android.exe
```

## Known Limitations

- This release uses the legacy HTTP server implementation
- RMCP server implementation has API compatibility issues and is not included in this build
- Some advanced analysis features may require specific Frida script versions

## Security Considerations

- The server provides powerful memory inspection capabilities
- Use only on devices you own or have explicit permission to analyze
- Review and customize bypass scripts according to your use case
- Keep the server and configuration files secure

## Troubleshooting

### ADB Connection Issues

- Ensure ADB is installed and in your PATH
- Verify USB debugging is enabled on the device
- Check that the device is properly connected

### Frida Connection Issues

- Ensure Frida tools are installed: `pip install frida-tools`
- Verify the Frida server path in config.toml
- Check that the device/emulator is properly configured for Frida

### Port Already in Use

- Change the port in config.toml under [server] section
- Ensure no other MCP server is running on the same port

## Support

For issues, questions, or contributions:

- GitHub Repository: https://github.com/BlackWh1te/MCP-ANDROID
- Issues: https://github.com/BlackWh1te/MCP-ANDROID/issues

## License

MIT License - See LICENSE file for details

## Credits

Built with:

- Rust programming language
- Frida dynamic instrumentation framework
- Model Context Protocol (MCP) SDK
- Tokio async runtime
- Axum web framework

## Changelog

### v0.1.0 (2024-01-10)

- Initial Windows release
- Legacy HTTP server implementation
- Core MCP tools for Android device management
- Memory inspection and analysis capabilities
- Comprehensive Android application analysis tool
- Multiple bypass scripts for anti-detection
- Production-ready features (metrics, rate limiting, authentication)
- Enhanced error handling and validation
