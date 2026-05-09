#!/bin/bash
# Example curl commands for interacting with the MCP Frida Android server

MCP_URL="http://127.0.0.1:3000/mcp"

echo "MCP Frida Android Server - curl Examples"
echo "========================================"
echo ""

# Initialize connection
echo "1. Initialize connection"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1
  }'
echo -e "\n"

# List available tools
echo "2. List available tools"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2
  }'
echo -e "\n"

# List devices
echo "3. List connected devices"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_devices",
      "arguments": {}
    },
    "id": 3
  }'
echo -e "\n"

# Get device info (replace with actual device serial)
echo "4. Get device info (replace DEVICE_SERIAL with actual serial)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_device_info",
      "arguments": {
        "serial": "DEVICE_SERIAL"
      }
    },
    "id": 4
  }'
echo -e "\n"

# Check connection
echo "5. Check device connection (replace DEVICE_SERIAL with actual serial)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "check_connection",
      "arguments": {
        "serial": "DEVICE_SERIAL"
      }
    },
    "id": 5
  }'
echo -e "\n"

# List processes
echo "6. List processes (replace DEVICE_SERIAL with actual serial)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_processes",
      "arguments": {
        "serial": "DEVICE_SERIAL"
      }
    },
    "id": 6
  }'
echo -e "\n"

# Attach to process
echo "7. Attach to process (replace DEVICE_SERIAL and TARGET)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "attach_process",
      "arguments": {
        "serial": "DEVICE_SERIAL",
        "target": "com.example.app"
      }
    },
    "id": 7
  }'
echo -e "\n"

# Scan memory
echo "8. Scan memory for pattern (replace DEVICE_SERIAL, PID, and pattern)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "scan_memory",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "pattern": "48 65 6c 6c 6f"
      }
    },
    "id": 8
  }'
echo -e "\n"

# Read memory
echo "9. Read memory at address (replace DEVICE_SERIAL, PID, address, and size)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "read_memory",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "address": "0x12345678",
        "size": 64
      }
    },
    "id": 9
  }'
echo -e "\n"

# Write memory
echo "10. Write memory (replace DEVICE_SERIAL, PID, address, and data)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "write_memory",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "address": "0x12345678",
        "data": "48656c6c6f"
      }
    },
    "id": 10
  }'
echo -e "\n"

# Enumerate memory regions
echo "11. Enumerate memory regions (replace DEVICE_SERIAL and PID)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "enumerate_memory_regions",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345
      }
    },
    "id": 11
  }'
echo -e "\n"

# Inject script
echo "12. Inject Frida script (replace DEVICE_SERIAL and TARGET)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "inject_script",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "target": "com.example.app",
        "script": "console.log(\"Hello from Frida!\");"
      }
    },
    "id": 12
  }'
echo -e "\n"

# Execute script
echo "13. Execute script on attached process (replace DEVICE_SERIAL, PID, and script)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_script",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "script": "console.log(\"Hello from Frida!\");"
      }
    },
    "id": 13
  }'
echo -e "\n"

# List hooks
echo "14. List active hooks (replace DEVICE_SERIAL and PID)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_hooks",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345
      }
    },
    "id": 14
  }'
echo -e "\n"

# Trace function
echo "15. Trace function (replace DEVICE_SERIAL, PID, module, and function)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "trace_function",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "module": "libc.so",
        "function": "open"
      }
    },
    "id": 15
  }'
echo -e "\n"

# Monitor API calls
echo "16. Monitor API calls (replace DEVICE_SERIAL, PID, and API name)"
curl -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "monitor_api_calls",
      "arguments": {
        "device_id": "DEVICE_SERIAL",
        "pid": 12345,
        "api_name": "open"
      }
    },
    "id": 16
  }'
echo -e "\n"

echo "========================================"
echo "Examples complete!"
echo "Note: Replace DEVICE_SERIAL, PID, and other placeholders with actual values"
