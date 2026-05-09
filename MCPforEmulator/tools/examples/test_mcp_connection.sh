#!/bin/bash

# Test MCP Server Connection
# This script tests the MCP server connection and basic functionality

echo "Testing MCP Server Connection..."
echo ""

# Configuration
MCP_SERVER="http://127.0.0.1:3000"

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "$MCP_SERVER/health" | jq '.'
echo ""

# Test tools list
echo "2. Testing tools list..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq '.result.tools[] | {name, description}'
echo ""

# Test initialize
echo "3. Testing initialize..."
curl -s -X POST "$MCP_SERVER/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 2
  }' | jq '.'
echo ""

echo "MCP Server connection test complete!"
