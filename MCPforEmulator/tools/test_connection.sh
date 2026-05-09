#!/bin/bash

# Test ADB and Frida Connection
# This script tests the connection to Android devices via ADB and Frida

echo "Testing ADB and Frida Connection..."
echo ""

# Check if ADB is installed
echo "1. Checking ADB installation..."
if command -v adb &> /dev/null; then
    echo "   ✓ ADB is installed"
    ADB_VERSION=$(adb version | head -n 1)
    echo "   Version: $ADB_VERSION"
else
    echo "   ✗ ADB is not installed or not in PATH"
    exit 1
fi
echo ""

# Check if Frida is installed
echo "2. Checking Frida installation..."
if command -v frida &> /dev/null; then
    echo "   ✓ Frida is installed"
    FRIDA_VERSION=$(frida --version)
    echo "   Version: $FRIDA_VERSION"
else
    echo "   ✗ Frida is not installed or not in PATH"
    echo "   Install from: https://frida.re/docs/installation/"
    exit 1
fi
echo ""

# List connected devices
echo "3. Listing connected devices..."
DEVICES=$(adb devices -l | tail -n +2 | grep -v "^$")
if [ -z "$DEVICES" ]; then
    echo "   ✗ No devices connected"
    echo "   Connect a device via USB or start an emulator"
    exit 1
else
    echo "   ✓ Found devices:"
    echo "$DEVICES" | while read line; do
        SERIAL=$(echo "$line" | awk '{print $1}')
        echo "     - $SERIAL"
    done
fi
echo ""

# Test ADB shell on first device
FIRST_DEVICE=$(adb devices | tail -n +2 | head -n 1 | awk '{print $1}')
if [ -n "$FIRST_DEVICE" ]; then
    echo "4. Testing ADB shell on $FIRST_DEVICE..."
    if adb -s "$FIRST_DEVICE" shell echo "test" &> /dev/null; then
        echo "   ✓ ADB shell working"
    else
        echo "   ✗ ADB shell not working"
        exit 1
    fi
    echo ""

    # Test Frida connection
    echo "5. Testing Frida connection to $FIRST_DEVICE..."
    if frida -D "$FIRST_DEVICE" -e "console.log('Frida connection successful')" &> /dev/null; then
        echo "   ✓ Frida connection working"
    else
        echo "   ✗ Frida connection not working"
        echo "   Make sure Frida server is running on the device"
        echo "   Setup: https://frida.re/docs/android/"
        exit 1
    fi
    echo ""

    # List processes via Frida
    echo "6. Testing Frida process listing on $FIRST_DEVICE..."
    if frida -D "$FIRST_DEVICE" ps &> /dev/null; then
        echo "   ✓ Frida process listing working"
        PROCESS_COUNT=$(frida -D "$FIRST_DEVICE" ps | tail -n +2 | wc -l)
        echo "     Found $PROCESS_COUNT processes"
    else
        echo "   ✗ Frida process listing not working"
        exit 1
    fi
fi

echo ""
echo "=" * 50
echo "All connection tests passed!"
echo "Your environment is ready for MCP server usage"
echo "=" * 50
