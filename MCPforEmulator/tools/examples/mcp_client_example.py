#!/usr/bin/env python3
"""
MCP Server Client Example
This script demonstrates how to interact with the MCP server programmatically
"""

import requests
import json

class MCPClient:
    def __init__(self, server_url="http://127.0.0.1:3000"):
        self.server_url = server_url
        self.request_id = 1

    def _send_request(self, method, params=None):
        """Send a request to the MCP server"""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "id": self.request_id
        }
        if params:
            payload["params"] = params

        self.request_id += 1

        response = requests.post(
            f"{self.server_url}/mcp",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        return response.json()

    def list_tools(self):
        """List all available MCP tools"""
        return self._send_request("tools/list")

    def initialize(self):
        """Initialize the MCP connection"""
        return self._send_request("initialize")

    def call_tool(self, tool_name, arguments):
        """Call a specific MCP tool"""
        params = {
            "name": tool_name,
            "arguments": arguments
        }
        return self._send_request("tools/call", params)

    def health_check(self):
        """Check server health"""
        response = requests.get(f"{self.server_url}/health")
        response.raise_for_status()
        return response.json()

    def get_metrics(self):
        """Get server metrics"""
        response = requests.get(f"{self.server_url}/metrics")
        response.raise_for_status()
        return response.json()

def main():
    # Initialize client
    client = MCPClient()

    print("MCP Server Client Example")
    print("=" * 50)

    # Health check
    print("\n1. Health Check:")
    health = client.health_check()
    print(f"   Status: {health['status']}")
    print(f"   Version: {health['version']}")

    # Initialize
    print("\n2. Initialize:")
    init = client.initialize()
    print(f"   Protocol: {init['result']['protocolVersion']}")
    print(f"   Server: {init['result']['serverInfo']['name']}")

    # List tools
    print("\n3. Available Tools:")
    tools = client.list_tools()
    for tool in tools['result']['tools']:
        print(f"   - {tool['name']}: {tool['description']}")

    # List devices
    print("\n4. List Devices:")
    devices = client.call_tool("list_devices", {})
    if 'result' in devices and 'devices' in devices['result']:
        for device in devices['result']['devices']:
            print(f"   - {device['serial']}: {device['model']} ({device['status']})")

    # Get metrics
    print("\n5. Server Metrics:")
    metrics = client.get_metrics()
    print(f"   Total requests: {metrics['metrics']['total_requests']}")
    print(f"   Success rate: {metrics['success_rate']:.2%}")
    print(f"   Uptime: {metrics['uptime_seconds']} seconds")

    print("\n" + "=" * 50)
    print("Example completed successfully!")

if __name__ == "__main__":
    main()
