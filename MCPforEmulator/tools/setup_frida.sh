#!/bin/bash

# Setup Frida Server on Android Device
# This script downloads and sets up Frida server on an Android device

set -e

DEVICE_SERIAL=$1

if [ -z "$DEVICE_SERIAL" ]; then
    echo "Usage: $0 <device_serial>"
    echo ""
    echo "Example: $0 emulator-5554"
    echo ""
    echo "Available devices:"
    adb devices -l
    exit 1
fi

echo "Setting up Frida on device: $DEVICE_SERIAL"
echo ""

# Check device connection
echo "1. Checking device connection..."
if ! adb -s "$DEVICE_SERIAL" shell echo "test" &> /dev/null; then
    echo "   ✗ Device not connected or not responding"
    exit 1
fi
echo "   ✓ Device connected"
echo ""

# Get device architecture
echo "2. Detecting device architecture..."
ARCH=$(adb -s "$DEVICE_SERIAL" shell getprop ro.product.cpu.abi)
echo "   Architecture: $ARCH"
echo ""

# Download Frida server
echo "3. Downloading Frida server..."
FRIDA_VERSION=$(frida --version)
FRIDA_SERVER_URL="https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/frida-server-${FRIDA_VERSION}-android-${ARCH}.xz"

echo "   Downloading from: $FRIDA_SERVER_URL"
if command -v wget &> /dev/null; then
    wget -O frida-server.xz "$FRIDA_SERVER_URL"
elif command -v curl &> /dev/null; then
    curl -L -o frida-server.xz "$FRIDA_SERVER_URL"
else
    echo "   ✗ Neither wget nor curl found"
    exit 1
fi
echo "   ✓ Downloaded"
echo ""

# Extract
echo "4. Extracting Frida server..."
if command -v xz &> /dev/null; then
    xz -d frida-server.xz
else
    echo "   ✗ xz not found. Install xz-utils"
    exit 1
fi
echo "   ✓ Extracted"
echo ""

# Push to device
echo "5. Pushing Frida server to device..."
adb -s "$DEVICE_SERIAL" push frida-server /data/local/tmp/
echo "   ✓ Pushed to /data/local/tmp/frida-server"
echo ""

# Set permissions
echo "6. Setting permissions..."
adb -s "$DEVICE_SERIAL" shell "chmod 755 /data/local/tmp/frida-server"
echo "   ✓ Permissions set"
echo ""

# Start Frida server
echo "7. Starting Frida server..."
adb -s "$DEVICE_SERIAL" shell "su -c '/data/local/tmp/frida-server &'"
sleep 2
echo "   ✓ Frida server started"
echo ""

# Verify Frida server is running
echo "8. Verifying Frida server..."
if frida -D "$DEVICE_SERIAL" ps &> /dev/null; then
    echo "   ✓ Frida server is running"
else
    echo "   ✗ Frida server not responding"
    echo "   Try starting manually:"
    echo "   adb -s $DEVICE_SERIAL shell 'su -c /data/local/tmp/frida-server &'"
    exit 1
fi
echo ""

# Cleanup
echo "9. Cleaning up..."
rm -f frida-server
echo "   ✓ Cleanup complete"
echo ""

echo "=" * 50
echo "Frida server setup complete on $DEVICE_SERIAL"
echo "=" * 50
