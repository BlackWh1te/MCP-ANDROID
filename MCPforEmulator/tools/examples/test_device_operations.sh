#!/bin/bash

# Test Device Operations via MCP
# This script demonstrates device management operations

echo "Testing Device Operations via MCP..."
echo ""

# Configuration
MCP_SERVER="http://127.0.0.1:3000"

# List devices
echo "1. Listing devices..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_devices",
      "arguments": {}
    },
    "id": 1
  }' | jq '.result.devices'
echo ""

# Get device info (replace with actual device serial)
DEVICE_SERIAL="emulator-5554"
echo "2. Getting device info for $DEVICE_SERIAL..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"get_device_info\",
      \"arguments\": {
        \"serial\": \"$DEVICE_SERIAL\"
      }
    },
    \"id\": 2
  }" | jq '.result.device'
echo ""

# Check connection
echo "3. Checking connection for $DEVICE_SERIAL..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"check_connection\",
      \"arguments\": {
        \"serial\": \"$DEVICE_SERIAL\"
      }
    },
    \"id\": 3
  }" | jq '.result'
echo ""

# List processes
echo "4. Listing processes on $DEVICE_SERIAL..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"list_processes\",
      \"arguments\": {
        \"serial\": \"$DEVICE_SERIAL\"
      }
    },
    \"id\": 4
  }" | jq '.result.processes[0:5]'
echo ""

echo "Device operations test complete!"
