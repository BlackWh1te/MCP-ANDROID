use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use crate::error::McpError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub adb: AdbConfig,
    pub mumu: MuMuConfig,
    pub frida: FridaConfig,
    pub bypass: BypassConfig,
    pub auth: AuthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbConfig {
    pub path: Option<String>,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuMuConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FridaConfig {
    pub server_path: Option<String>,
    pub device_port: u16,
    pub script_timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BypassConfig {
    pub auto_inject: bool,
    pub bypass_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub enabled: bool,
    pub api_keys: Option<Vec<ApiKeyConfig>>,
    pub require_auth: bool,
    pub audit_log_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyConfig {
    pub key: String,
    pub name: String,
    pub permissions: Vec<String>,
}


impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 3000,
            },
            adb: AdbConfig {
                path: None,
                timeout_seconds: 30,
            },
            mumu: MuMuConfig {
                enabled: true,
                host: "127.0.0.1".to_string(),
                port: 7555,
            },
            frida: FridaConfig {
                server_path: None,
                device_port: 27042,
                script_timeout_seconds: 60,
            },
            bypass: BypassConfig {
                auto_inject: true,
                bypass_type: "combined".to_string(),
            },
            auth: AuthConfig {
                enabled: false,
                api_keys: None,
                require_auth: false,
                audit_log_enabled: true,
            },
        }
    }
}

impl Config {
    /// Validate the configuration
    pub fn validate(&self) -> Result<(), McpError> {
        self.server.validate()?;
        self.adb.validate()?;
        self.frida.validate()?;
        self.bypass.validate()?;
        self.auth.validate()?;
        Ok(())
    }
}

impl ServerConfig {
    pub fn validate(&self) -> Result<(), McpError> {
        if self.host.is_empty() {
            return Err(McpError::ConfigError("Server host cannot be empty".to_string()));
        }
        if self.port == 0 || self.port > 65535 {
            return Err(McpError::ConfigError(format!(
                "Invalid server port: {}. Must be between 1 and 65535",
                self.port
            )));
        }
        Ok(())
    }
}

impl AdbConfig {
    pub fn validate(&self) -> Result<(), McpError> {
        if self.timeout_seconds == 0 || self.timeout_seconds > 3600 {
            return Err(McpError::ConfigError(format!(
                "Invalid ADB timeout: {}. Must be between 1 and 3600 seconds",
                self.timeout_seconds
            )));
        }
        Ok(())
    }
}

impl FridaConfig {
    pub fn validate(&self) -> Result<(), McpError> {
        if self.device_port == 0 || self.device_port > 65535 {
            return Err(McpError::ConfigError(format!(
                "Invalid Frida device port: {}. Must be between 1 and 65535",
                self.device_port
            )));
        }
        if self.script_timeout_seconds == 0 || self.script_timeout_seconds > 600 {
            return Err(McpError::ConfigError(format!(
                "Invalid script timeout: {}. Must be between 1 and 600 seconds",
                self.script_timeout_seconds
            )));
        }
        Ok(())
    }
}

impl BypassConfig {
    pub fn validate(&self) -> Result<(), McpError> {
        let valid_types = ["emulator", "root", "combined"];
        if !valid_types.contains(&self.bypass_type.as_str()) {
            return Err(McpError::ConfigError(format!(
                "Invalid bypass type: {}. Must be one of: emulator, root, combined",
                self.bypass_type
            )));
        }
        Ok(())
    }
}

impl AuthConfig {
    pub fn validate(&self) -> Result<(), McpError> {
        if self.enabled && self.api_keys.is_none() && self.require_auth {
            return Err(McpError::ConfigError(
                "Authentication is required but no API keys are configured".to_string()
            ));
        }
        Ok(())
    }
}

pub fn load_config() -> Result<Config> {
    // Try to load from config file
    let config_path = PathBuf::from("config.toml");

    let config = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .context("Failed to read config file")?;
        let config: Config = toml::from_str(&content)
            .context("Failed to parse config file")?;
        config
    } else {
        Config::default()
    };

    // Validate the configuration
    config.validate().context("Configuration validation failed")?;

    Ok(config)
}

pub fn get_adb_path(config: &Config) -> String {
    config.adb.path.clone().unwrap_or_else(|| {
        // Try to find adb in PATH
        if cfg!(windows) {
            "adb.exe".to_string()
        } else {
            "adb".to_string()
        }
    })
}

pub fn get_mumu_address(config: &Config) -> String {
    if config.mumu.enabled {
        format!("{}:{}", config.mumu.host, config.mumu.port)
    } else {
        String::new()
    }
}

pub fn load_default_bypass_script(bypass_type: &str) -> Result<String> {
    let script_path = PathBuf::from("default_scripts.js");
    
    if !script_path.exists() {
        return Ok(get_embedded_bypass_script(bypass_type));
    }
    
    let _content = std::fs::read_to_string(&script_path)
        .context("Failed to read default scripts file")?;
    
    // For now, return the embedded script
    // In production, this would parse the JS file and extract the appropriate script
    Ok(get_embedded_bypass_script(bypass_type))
}

fn get_embedded_bypass_script(bypass_type: &str) -> String {
    match bypass_type {
        "emulator" => get_emulator_bypass_script(),
        "root" => get_root_bypass_script(),
        "combined" => get_combined_bypass_script(),
        _ => String::new(),
    }
}

fn get_emulator_bypass_script() -> String {
    r#"
if (Java.available) {
    Java.perform(function() {
        console.log("[*] Starting Emulator Detection Bypass");
        
        try {
            var Build = Java.use("android.os.Build");
            Build.FINGERPRINT.value = "google/redfin/redfin:13/TP1A.221105.003/9322115:user/release-keys";
            Build.MANUFACTURER.value = "Google";
            Build.BRAND.value = "google";
            Build.MODEL.value = "Pixel 5";
            Build.DEVICE.value = "redfin";
            Build.HARDWARE.value = "redfin";
            Build.BOARD.value = "redfin";
            Build.PRODUCT.value = "redfin";
            Build.SERIAL.value = "R58CR45JXK";
            Build.ID.value = "TP1A.221105.003";
            Build.TAGS.value = "release-keys";
            Build.TYPE.value = "user";
            Build.USER.value = "android-build";
            Build.HOST.value = "abfarm-uscentral1-c-001";
            console.log("[+] Build properties bypassed");
        } catch (e) {
            console.log("[-] Build bypass failed: " + e);
        }
        
        try {
            var TelephonyManager = Java.use("android.telephony.TelephonyManager");
            TelephonyManager.getNetworkOperatorName.overload().implementation = function() {
                return "T-Mobile";
            };
            TelephonyManager.getSimOperatorName.overload().implementation = function() {
                return "T-Mobile";
            };
            TelephonyManager.getNetworkOperator.overload().implementation = function() {
                return "310260";
            };
            TelephonyManager.getSimOperator.overload().implementation = function() {
                return "310260";
            };
            TelephonyManager.getSubscriberId.overload().implementation = function() {
                return "310260123456789";
            };
            TelephonyManager.getDeviceId.overload().implementation = function() {
                return "359872046812345";
            };
            TelephonyManager.getSimSerialNumber.overload().implementation = function() {
                return "89912601234567890123";
            };
            TelephonyManager.getLine1Number.overload().implementation = function() {
                return "+15551234567";
            };
            console.log("[+] TelephonyManager bypassed");
        } catch (e) {
            console.log("[-] TelephonyManager bypass failed: " + e);
        }
        
        try {
            var Settings = Java.use("android.provider.Settings$Secure");
            Settings.getString.overload('android.content.ContentResolver', 'java.lang.String').implementation = function(cr, name) {
                if (name === 'android_id') {
                    return '3f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c';
                }
                return this.getString(cr, name);
            };
            console.log("[+] Android ID bypassed");
        } catch (e) {
            console.log("[-] Android ID bypass failed: " + e);
        }
        
        try {
            var WifiInfo = Java.use("android.net.wifi.WifiInfo");
            WifiInfo.getMacAddress.implementation = function() {
                return "02:00:00:00:00:00";
            };
            console.log("[+] WiFi MAC bypassed");
        } catch (e) {
            console.log("[-] WiFi MAC bypass failed: " + e);
        }
        
        try {
            var BluetoothAdapter = Java.use("android.bluetooth.BluetoothAdapter");
            BluetoothAdapter.getAddress.implementation = function() {
                return "02:00:00:00:00:01";
            };
            console.log("[+] Bluetooth MAC bypassed");
        } catch (e) {
            console.log("[-] Bluetooth MAC bypass failed: " + e);
        }
        
        try {
            var BuildProperties = Java.use("android.os.SystemProperties");
            BuildProperties.get.overload('java.lang.String').implementation = function(key) {
                if (key.indexOf('ro.kernel.qemu') !== -1 ||
                    key.indexOf('ro.build.product') !== -1 ||
                    key.indexOf('ro.hardware') !== -1 ||
                    key.indexOf('ro.product.device') !== -1 ||
                    key.indexOf('ro.boot.hardware') !== -1 ||
                    key.indexOf('ro.product.model') !== -1 ||
                    key.indexOf('ro.product.brand') !== -1 ||
                    key.indexOf('ro.product.manufacturer') !== -1 ||
                    key.indexOf('ro.product.name') !== -1 ||
                    key.indexOf('ro.boot.qemu') !== -1 ||
                    key.indexOf('qemu') !== -1) {
                    return '';
                }
                return this.get(key);
            };
            console.log("[+] SystemProperties bypassed");
        } catch (e) {
            console.log("[-] SystemProperties bypass failed: " + e);
        }
        
        try {
            var File = Java.use("java.io.File");
            File.exists.implementation = function() {
                var path = this.getAbsolutePath();
                var emulatorPaths = [
                    '/dev/socket/qemud',
                    '/dev/qemu_pipe',
                    '/system/lib/libc_malloc_debug_qemu.so',
                    '/sys/qemu_trace',
                    '/system/bin/qemu-props',
                    '/dev/qemu',
                    '/proc/tty/drivers',
                    '/system/bin/qemu-trace',
                    '/system/lib/libqemu-props.so',
                    '/system/lib/libqemu_pipe.so',
                    '/system/bin/qemud',
                    '/dev/socket/genyd',
                    '/dev/socket/baseband_genyd',
                    '/system/lib/libgenyd_compat.so'
                ];
                for (var i = 0; i < emulatorPaths.length; i++) {
                    if (path.indexOf(emulatorPaths[i]) !== -1) {
                        return false;
                    }
                }
                return this.exists();
            };
            console.log("[+] Emulator file paths bypassed");
        } catch (e) {
            console.log("[-] File path bypass failed: " + e);
        }
        
        try {
            var Runtime = Java.use("java.lang.Runtime");
            Runtime.exec.overload('java.lang.String').implementation = function(cmd) {
                if (cmd.indexOf('getprop') !== -1 || 
                    cmd.indexOf('qemu') !== -1 || 
                    cmd.indexOf('goldfish') !== -1) {
                    return null;
                }
                return this.exec(cmd);
            };
            console.log("[+] Runtime exec bypassed");
        } catch (e) {
            console.log("[-] Runtime exec bypass failed: " + e);
        }
        
        console.log("[*] Emulator Detection Bypass Complete");
    });
}
"#.to_string()
}

fn get_root_bypass_script() -> String {
    r#"
if (Java.available) {
    Java.perform(function() {
        console.log("[*] Starting Root Detection Bypass");
        
        try {
            var File = Java.use("java.io.File");
            File.exists.implementation = function() {
                var path = this.getAbsolutePath();
                var suPaths = ["/system/app/Superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su", "/magisk/.core/bin/su"];
                for (var i = 0; i < suPaths.length; i++) {
                    if (path.indexOf(suPaths[i]) !== -1) {
                        return false;
                    }
                }
                return this.exists();
            };
            console.log("[+] Su binary checks bypassed");
        } catch (e) {
            console.log("[-] Su binary bypass failed: " + e);
        }
        
        try {
            var PackageManager = Java.use("android.content.pm.PackageManager");
            PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkgName, flags) {
                var rootApps = ["com.noshufou.android.su", "com.thirdparty.superuser", "eu.chainfire.supersu", "com.topjohnwu.magisk"];
                for (var i = 0; i < rootApps.length; i++) {
                    if (pkgName === rootApps[i]) {
                        throw new Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgName);
                    }
                }
                return this.getPackageInfo(pkgName, flags);
            };
            console.log("[+] Root app checks bypassed");
        } catch (e) {
            console.log("[-] Root app bypass failed: " + e);
        }
        
        console.log("[*] Root Detection Bypass Complete");
    });
}
"#.to_string()
}

fn get_combined_bypass_script() -> String {
    get_emulator_bypass_script() + "\n" + &get_root_bypass_script()
}
