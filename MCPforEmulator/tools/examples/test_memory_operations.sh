#!/bin/bash

# Test Memory Operations via MCP
# This script demonstrates memory inspection operations

echo "Testing Memory Operations via MCP..."
echo ""

# Configuration
MCP_SERVER="http://127.0.0.1:3000"
DEVICE_SERIAL="emulator-5554"
TARGET_PID="12345"  # Replace with actual PID
ADDRESS="0x12345678"  # Replace with actual address

# Enumerate memory regions
echo "1. Enumerating memory regions for PID $TARGET_PID..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"enumerate_memory_regions\",
      \"arguments\": {
        \"device_id\": \"$DEVICE_SERIAL\",
        \"pid\": $TARGET_PID
      }
    },
    \"id\": 1
  }" | jq '.result.regions[0:5]'
echo ""

# Scan memory for pattern
echo "2. Scanning memory for pattern '48 65 6c 6c 6f' (Hello)..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"scan_memory\",
      \"arguments\": {
        \"device_id\": \"$DEVICE_SERIAL\",
        \"pid\": $TARGET_PID,
        \"pattern\": \"48 65 6c 6c 6f\"
      }
    },
    \"id\": 2
  }" | jq '.result.matches'
echo ""

# Read memory at address
echo "3. Reading 64 bytes at address $ADDRESS..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"read_memory\",
      \"arguments\": {
        \"device_id\": \"$DEVICE_SERIAL\",
        \"pid\": $TARGET_PID,
        \"address\": \"$ADDRESS\",
        \"size\": 64
      }
    },
    \"id\": 3
  }" | jq '.result'
echo ""

# Enumerate modules
echo "4. Enumerating modules for PID $TARGET_PID..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"enumerate_modules\",
      \"arguments\": {
        \"device_id\": \"$DEVICE_SERIAL\",
        \"pid\": $TARGET_PID
      }
    },
    \"id\": 4
  }" | jq '.result.modules[0:5]'
echo ""

echo "Memory operations test complete!"
echo ""
echo "Note: Replace DEVICE_SERIAL, TARGET_PID, and ADDRESS with actual values"
