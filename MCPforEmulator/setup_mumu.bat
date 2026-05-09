@echo off
echo ========================================
echo MuMu Emulator Setup for MCP Server
echo ========================================
echo.

echo [1/5] Checking ADB installation...
where adb >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: ADB not found in PATH
    echo Please install Android SDK Platform Tools
    echo Download from: https://developer.android.com/studio/releases/platform-tools
    pause
    exit /b 1
)
echo ADB found: 
where adb
echo.

echo [2/5] Connecting to MuMu Emulator...
echo Default MuMu port: 7555
adb connect 127.0.0.1:7555
if %errorlevel% neq 0 (
    echo ERROR: Failed to connect to MuMu
    echo Make sure MuMu is running and ROOT is enabled
    pause
    exit /b 1
)
echo.
echo Connected devices:
adb devices
echo.

echo [3/5] Testing MuMu connection...
adb -s 127.0.0.1:7555 shell getprop ro.build.version.release
if %errorlevel% neq 0 (
    echo ERROR: Cannot communicate with MuMu
    pause
    exit /b 1
)
echo.

echo [4/5] Checking ROOT access...
adb -s 127.0.0.1:7555 shell su -c "id"
if %errorlevel% neq 0 (
    echo WARNING: ROOT access may not be working
    echo Make sure ROOT is enabled in MuMu settings
) else (
    echo ROOT access confirmed!
)
echo.

echo [5/5] Checking Frida...
where frida >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Frida not found in PATH
    echo Install with: pip install frida-tools
    echo Download from: https://frida.re/docs/installation/
) else (
    echo Frida found:
    where frida
)
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Install Frida server on MuMu (see MUMU_SETUP.md)
echo 2. Update config.toml with ADB path
echo 3. Start MCP server: cargo run
echo 4. Configure MCP server in Devin
echo.
echo Press any key to open MUMU_SETUP.md...
pause >nul
start MUMU_SETUP.md
