#!/usr/bin/env python3
"""
Example MCP client for the Frida Android server
"""

import requests
import json
import sys

class MCPClient:
    def __init__(self, url="http://127.0.0.1:3000/mcp"):
        self.url = url
        self.request_id = 0

    def _send_request(self, method, params=None):
        """Send a request to the MCP server"""
        self.request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self.request_id
        }
        
        try:
            response = requests.post(self.url, json=payload, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error: {e}")
            return None

    def list_tools(self):
        """List all available MCP tools"""
        return self._send_request("tools/list")

    def call_tool(self, tool_name, arguments):
        """Call a specific MCP tool"""
        params = {
            "name": tool_name,
            "arguments": arguments
        }
        return self._send_request("tools/call", params)

    def initialize(self):
        """Initialize the MCP connection"""
        return self._send_request("initialize")

def main():
    # Initialize client
    client = MCPClient()
    
    # Initialize connection
    print("Initializing MCP connection...")
    init_result = client.initialize()
    if init_result:
        print("Initialized:", json.dumps(init_result, indent=2))
    else:
        print("Failed to initialize")
        sys.exit(1)
    
    # List available tools
    print("\n" + "="*50)
    print("Available Tools:")
    print("="*50)
    tools_result = client.list_tools()
    if tools_result and "result" in tools_result:
        tools = tools_result["result"].get("tools", [])
        for tool in tools:
            print(f"\n{tool['name']}: {tool['description']}")
    else:
        print("Failed to list tools")
    
    # Example: List devices
    print("\n" + "="*50)
    print("Listing Devices:")
    print("="*50)
    devices_result = client.call_tool("list_devices", {})
    if devices_result and "result" in devices_result:
        print(json.dumps(devices_result["result"], indent=2))
    else:
        print("Failed to list devices")
    
    # Example: List processes (if a device is available)
    print("\n" + "="*50)
    print("Listing Processes:")
    print("="*50)
    # Replace with actual device serial
    processes_result = client.call_tool("list_processes", {
        "serial": "your_device_serial_here"
    })
    if processes_result and "result" in processes_result:
        print(json.dumps(processes_result["result"], indent=2))
    else:
        print("Failed to list processes (or no device connected)")
    
    # Example: Inject a simple script
    print("\n" + "="*50)
    print("Injecting Script:")
    print("="*50)
    script_result = client.call_tool("inject_script", {
        "device_id": "your_device_serial_here",
        "target": "com.example.app",
        "script": "console.log('Hello from Frida!');"
    })
    if script_result and "result" in script_result:
        print(json.dumps(script_result["result"], indent=2))
    else:
        print("Failed to inject script")

if __name__ == "__main__":
    main()
