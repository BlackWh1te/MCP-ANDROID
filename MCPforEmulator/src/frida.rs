use anyhow::{Context, Result};
use async_process::{Command, Stdio};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::timeout;
use tracing::{debug, info, warn};

use crate::config::Config;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FridaProcess {
    pub pid: u32,
    pub identifier: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRegion {
    pub base: String,
    pub size: usize,
    pub protection: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMatch {
    pub address: String,
    pub bytes: Vec<u8>,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookInfo {
    pub name: String,
    pub module: String,
    pub address: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadInfo {
    pub id: u32,
    pub state: String,
    pub name: Option<String>,
}

pub struct FridaBridge {
    frida_path: String,
    device_port: u16,
    timeout: Duration,
}

impl FridaBridge {
    pub fn new(config: &Config) -> Self {
        let frida_path = config.frida.server_path.clone().unwrap_or_else(|| {
            if cfg!(windows) {
                "frida.exe".to_string()
            } else {
                "frida".to_string()
            }
        });
        
        let timeout = Duration::from_secs(config.frida.script_timeout_seconds);
        let device_port = config.frida.device_port;
        
        Self {
            frida_path,
            device_port,
            timeout,
        }
    }

    /// List processes on the target device
    pub async fn list_processes(&self, device_id: &str) -> Result<Vec<FridaProcess>> {
        debug!("Listing Frida processes for device: {}", device_id);
        
        let output = timeout(self.timeout, Command::new(&self.frida_path)
            .arg("-D")
            .arg(device_id)
            .arg("ps")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("Frida ps command timed out")?
        .context("Failed to execute Frida ps command")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Frida ps command failed: {}", error);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_processes(&stdout)
    }

    /// Attach to a process
    pub async fn attach_process(&self, device_id: &str, target: &str) -> Result<String> {
        info!("Attaching to process {} on device {}", target, device_id);

        // Use frida to attach to the process
        let output = timeout(self.timeout, Command::new(&self.frida_path)
            .arg("-D")
            .arg(device_id)
            .arg(target)
            .arg("-e")
            .arg("console.log('Attached successfully');")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("Frida attach command timed out")?
        .context("Failed to execute Frida attach command")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);

            // Provide more detailed error messages
            let error_message = if stderr.contains("not found") {
                format!("Process '{}' not found on device '{}'. Use list_processes to find available processes.", target, device_id)
            } else if stderr.contains("permission") || stderr.contains("denied") {
                format!("Permission denied when attaching to '{}'. The process may require root access or anti-debugging protection.", target)
            } else if stderr.contains("already attached") {
                format!("Already attached to '{}'. Detach first or use the existing session.", target)
            } else if stderr.contains("timeout") {
                format!("Attach operation timed out for '{}'. The process may be hung or Frida server not responding.", target)
            } else {
                format!("Failed to attach to '{}': {}", target, stderr.trim())
            };

            anyhow::bail!("{}\nStdout: {}\nStderr: {}", error_message, stdout.trim(), stderr.trim());
        }

        let session_id = format!("session_{}_{}", target, uuid::Uuid::new_v4());
        Ok(session_id)
    }

    /// Spawn a process
    pub async fn spawn_process(&self, device_id: &str, package: &str) -> Result<u32> {
        info!("Spawning process {} on device {}", package, device_id);
        
        let output = timeout(self.timeout, Command::new(&self.frida_path)
            .arg("-D")
            .arg(device_id)
            .arg("-f")
            .arg(package)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("Frida spawn command timed out")?
        .context("Failed to execute Frida spawn command")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Frida spawn command failed: {}", error);
        }

        // Parse PID from output (simplified)
        let stdout = String::from_utf8_lossy(&output.stdout);
        self.extract_pid(&stdout)
    }

    /// Scan memory for patterns
    pub async fn scan_memory(
        &self,
        device_id: &str,
        pid: u32,
        pattern: &str,
    ) -> Result<Vec<MemoryMatch>> {
        debug!(
            "Scanning memory for pattern {} in process {} on device {}",
            pattern, pid, device_id
        );

        // Validate pattern format
        if !self.is_valid_hex_pattern(pattern) {
            anyhow::bail!("Invalid hex pattern: {}. Expected format: '48 65 6c 6c 6f'", pattern);
        }

        let script = format!(
            r#"
            var pattern = "{}";
            var matches = [];
            var maxMatches = 1000; // Limit to prevent excessive output
            var matchCount = 0;

            Process.enumerateRanges('r--', {{
                onMatch: function(range) {{
                    if (matchCount >= maxMatches) {{
                        return 'stop';
                    }}
                    Memory.scan(range.base, range.size, pattern, {{
                        onMatch: function(address, size) {{
                            if (matchCount < maxMatches) {{
                                matches.push({{
                                    address: address.toString(),
                                    size: size,
                                    offset: address.sub(range.base).toInt32()
                                }});
                                matchCount++;
                            }}
                        }},
                        onComplete: function() {{}}
                    }});
                }},
                onComplete: function() {{
                    send({{
                        matches: matches,
                        truncated: matchCount >= maxMatches
                    }});
                }}
            }});
            "#,
            pattern
        );

        let result = self.execute_script(device_id, pid, &script).await?;

        // Parse matches from JSON result with better error handling
        let result_obj = result.as_object()
            .context("Script output is not an object")?;

        let matches_json = result_obj.get("matches")
            .and_then(|v| v.as_array())
            .context("No matches array in script output")?;

        let mut matches = Vec::new();
        for match_json in matches_json {
            if let (Some(address), Some(size), Some(offset)) = (
                match_json.get("address").and_then(|v| v.as_str()),
                match_json.get("size").and_then(|v| v.as_u64()),
                match_json.get("offset").and_then(|v| v.as_i64())
            ) {
                matches.push(MemoryMatch {
                    address: address.to_string(),
                    bytes: vec![], // Would need actual bytes from memory
                    offset: offset as usize,
                });
            }
        }

        // Check if results were truncated
        if result_obj.get("truncated").and_then(|v| v.as_bool()).unwrap_or(false) {
            debug!("Memory scan results truncated (max 1000 matches)");
        }

        Ok(matches)
    }

    /// Validate hex pattern format
    fn is_valid_hex_pattern(&self, pattern: &str) -> bool {
        let parts: Vec<&str> = pattern.split_whitespace().collect();
        if parts.is_empty() {
            return false;
        }

        for part in parts {
            if part.len() != 2 {
                return false;
            }
            if !part.chars().all(|c| c.is_ascii_hexdigit()) {
                return false;
            }
        }

        true
    }

    /// Read memory at address
    pub async fn read_memory(
        &self,
        device_id: &str,
        pid: u32,
        address: &str,
        size: usize,
    ) -> Result<Vec<u8>> {
        debug!(
            "Reading memory at address {} (size: {}) for process {} on device {}",
            address, size, pid, device_id
        );

        // Validate parameters
        if size == 0 {
            anyhow::bail!("Size cannot be zero");
        }
        if size > 10_000_000 {
            // Limit to 10MB to prevent excessive memory usage
            anyhow::bail!("Size too large: {}. Maximum is 10MB", size);
        }
        if !self.is_valid_hex_address(address) {
            anyhow::bail!("Invalid hex address: {}. Expected format: '0x12345678'", address);
        }

        let script = format!(
            r#"
            try {{
                var address = ptr("{}");
                var size = {};
                var data = Memory.readByteArray(address, size);
                send({{
                    success: true,
                    data: Array.from(new Uint8Array(data)),
                    address: address.toString(),
                    size: size
                }});
            }} catch (e) {{
                send({{
                    success: false,
                    error: e.message,
                    address: "{}",
                    size: {}
                }});
            }}
            "#,
            address, size, address, size
        );

        let result = self.execute_script(device_id, pid, &script).await?;

        // Parse the result and return bytes with better error handling
        if let Some(success) = result.get("success").and_then(|v| v.as_bool()) {
            if success {
                if let Some(data_array) = result.get("data").and_then(|v| v.as_array()) {
                    let mut bytes = Vec::new();
                    for byte_value in data_array {
                        if let Some(byte) = byte_value.as_u64() {
                            bytes.push(byte as u8);
                        }
                    }
                    if bytes.len() != size {
                        debug!("Warning: Read {} bytes but requested {}", bytes.len(), size);
                    }
                    return Ok(bytes);
                }
            } else {
                let error = result.get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                let addr = result.get("address")
                    .and_then(|v| v.as_str())
                    .unwrap_or(address);
                anyhow::bail!("Memory read failed at {}: {}", addr, error);
            }
        }

        anyhow::bail!("Failed to parse memory read response")
    }

    /// Validate hex address format
    fn is_valid_hex_address(&self, address: &str) -> bool {
        let address_lower = address.to_lowercase();
        if address_lower.starts_with("0x") || address_lower.starts_with("0X") {
            address_lower[2..].chars().all(|c| c.is_ascii_hexdigit())
        } else {
            false
        }
    }

    /// Write memory at address
    pub async fn write_memory(
        &self,
        device_id: &str,
        pid: u32,
        address: &str,
        data: &[u8],
    ) -> Result<()> {
        debug!(
            "Writing memory at address {} (size: {}) for process {} on device {}",
            address,
            data.len(),
            pid,
            device_id
        );

        // Validate parameters
        if data.is_empty() {
            anyhow::bail!("Data cannot be empty");
        }
        if data.len() > 1_000_000 {
            // Limit to 1MB to prevent excessive memory usage
            anyhow::bail!("Data too large: {} bytes. Maximum is 1MB", data.len());
        }
        if !self.is_valid_hex_address(address) {
            anyhow::bail!("Invalid hex address: {}. Expected format: '0x12345678'", address);
        }

        let hex_data = hex::encode(data);
        let script = format!(
            r#"
            try {{
                var address = ptr("{}");
                var data = hex2bytes("{}");
                Memory.writeByteArray(address, data);
                send({{
                    success: true,
                    address: address.toString(),
                    bytesWritten: data.length
                }});
            }} catch (e) {{
                send({{
                    success: false,
                    error: e.message,
                    address: "{}"
                }});
            }}

            function hex2bytes(hex) {{
                var bytes = [];
                for (var i = 0; i < hex.length; i += 2) {{
                    bytes.push(parseInt(hex.substr(i, 2), 16));
                }}
                return bytes;
            }}
            "#,
            address, hex_data, address
        );

        let result = self.execute_script(device_id, pid, &script).await?;

        // Check if write was successful with better error handling
        if let Some(success) = result.get("success").and_then(|v| v.as_bool()) {
            if success {
                let bytes_written = result.get("bytesWritten")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                if bytes_written != data.len() as u64 {
                    debug!("Warning: Wrote {} bytes but attempted {}", bytes_written, data.len());
                }
            } else {
                let error = result.get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                let addr = result.get("address")
                    .and_then(|v| v.as_str())
                    .unwrap_or(address);
                anyhow::bail!("Memory write failed at {}: {}", addr, error);
            }
        } else {
            anyhow::bail!("Failed to parse memory write response");
        }

        Ok(())
    }

    /// Enumerate memory regions
    pub async fn enumerate_memory_regions(
        &self,
        device_id: &str,
        pid: u32,
    ) -> Result<Vec<MemoryRegion>> {
        debug!(
            "Enumerating memory regions for process {} on device {}",
            pid, device_id
        );
        
        let script = r#"
            var regions = [];
            Process.enumerateRanges('---', {
                onMatch: function(range) {
                    regions.push({
                        base: range.base.toString(),
                        size: range.size,
                        protection: range.protection
                    });
                },
                onComplete: function() {
                    send(regions);
                }
            });
        "#.to_string();

        let result = self.execute_script(device_id, pid, &script).await?;
        
        // Parse regions from JSON result
        let regions_json: Vec<serde_json::Value> = serde_json::from_value(result)
            .context("Failed to parse regions from script output")?;
        
        let mut regions = Vec::new();
        for region_json in regions_json {
            if let (Some(base), Some(size), Some(protection)) = (
                region_json.get("base").and_then(|v| v.as_str()),
                region_json.get("size").and_then(|v| v.as_u64()),
                region_json.get("protection").and_then(|v| v.as_str())
            ) {
                regions.push(MemoryRegion {
                    base: base.to_string(),
                    size: size as usize,
                    protection: protection.to_string(),
                });
            }
        }
        
        Ok(regions)
    }

    /// Inject and execute a Frida script
    pub async fn inject_script(
        &self,
        device_id: &str,
        target: &str,
        script: &str,
    ) -> Result<String> {
        info!(
            "Injecting script into {} on device {}",
            target, device_id
        );

        // Validate script is not empty
        if script.trim().is_empty() {
            anyhow::bail!("Script cannot be empty");
        }

        let output = timeout(self.timeout, Command::new(&self.frida_path)
            .arg("-D")
            .arg(device_id)
            .arg("-l")
            .arg("-")
            .arg(target)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .output())
        .await
        .context("Frida inject command timed out")?
        .context("Failed to execute Frida inject command")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);

            // Provide more detailed error messages
            let error_message = if stderr.contains("not found") {
                format!("Target process '{}' not found on device '{}'. Verify the process is running.", target, device_id)
            } else if stderr.contains("permission") || stderr.contains("denied") {
                format!("Permission denied when injecting into '{}'. The process may require root access.", target)
            } else if stderr.contains("timeout") {
                format!("Script injection timed out for '{}'. The script may be too complex or the process is unresponsive.", target)
            } else if stderr.contains(" Frida ") {
                // Frida-specific error
                format!("Frida error: {}", stderr.trim())
            } else {
                format!("Frida inject failed for '{}': {}", target, stderr.trim())
            };

            anyhow::bail!("{}\nStdout: {}\nStderr: {}", error_message, stdout.trim(), stderr.trim());
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Execute a script on an attached process
    pub async fn execute_script(
        &self,
        device_id: &str,
        pid: u32,
        script: &str,
    ) -> Result<serde_json::Value> {
        let output = timeout(self.timeout, Command::new(&self.frida_path)
            .arg("-D")
            .arg(device_id)
            .arg("-p")
            .arg(pid.to_string())
            .arg("-l")
            .arg("-")
            .arg("-e")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .output())
        .await
        .context("Frida script execution timed out")?
        .context("Failed to execute Frida script")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Frida script execution failed: {}", error);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_frida_output(&stdout)
    }

    /// Parse Frida output with better error handling
    fn parse_frida_output(&self, output: &str) -> Result<serde_json::Value> {
        // Frida may output multiple JSON objects or mixed output
        // Try to find JSON objects in the output
        let lines: Vec<&str> = output.lines().collect();

        // First, try to parse the entire output as JSON
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(output) {
            return Ok(json);
        }

        // If that fails, try to find JSON objects in individual lines
        for line in lines {
            let trimmed = line.trim();
            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    return Ok(json);
                }
            }
        }

        // If no JSON found, return the raw output as a string
        Ok(serde_json::json!({
            "raw_output": output,
            "warning": "Could not parse as JSON, returning raw output"
        }))
    }

    /// List active hooks
    pub async fn list_hooks(&self, device_id: &str, pid: u32) -> Result<Vec<HookInfo>> {
        debug!("Listing hooks for process {} on device {}", pid, device_id);
        
        let script = r#"
            var hooks = [];
            Interceptor.attach(Module.findExportByName(null, 'open'), {
                onEnter: function(args) {
                    hooks.push({
                        name: 'open',
                        module: 'libc',
                        address: this.returnAddress.toString(),
                        active: true
                    });
                }
            });
            send(hooks);
        "#.to_string();

        let _hooks = self.execute_script(device_id, pid, &script).await?;
        
        // Parse hooks from script output
        // This is simplified - real implementation would maintain hook state
        Ok(vec
![])
    }

    fn parse_processes(&self, output: &str) -> Result<Vec<FridaProcess>> {
        let mut processes = Vec::new();
        
        for line in output.lines() {
            if line.trim().is_empty() || line.starts_with("PID") {
                continue;
            }
            
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let pid = parts[0].parse::<u32>().unwrap_or(0);
                let name = parts[1].to_string();
                let identifier = if parts.len() > 2 {
                    parts[2].to_string()
                } else {
                    name.clone()
                };
                
                processes.push(FridaProcess {
                    pid,
                    identifier,
                    name,
                });
            }
        }
        
        Ok(processes)
    }

    fn extract_pid(&self, output: &str) -> Result<u32> {
        // Extract PID from output - simplified implementation
        for line in output.lines() {
            if line.contains("pid") || line.contains("PID") {
                if let Some(pid_str) = line.split_whitespace().nth(1) {
                    return pid_str.parse::<u32>()
                        .context("Failed to parse PID");
                }
            }
        }
        anyhow::bail!("Could not extract PID from output")
    }

    /// Enumerate threads in a process
    pub async fn enumerate_threads(&self, device_id: &str, pid: u32) -> Result<Vec<ThreadInfo>> {
        debug!("Enumerating threads for process {} on device {}", pid, device_id);
        
        let script = r#"
            var threads = [];
            Process.enumerateThreads({
                onMatch: function(thread) {
                    threads.push({
                        id: thread.id,
                        state: thread.state,
                        name: thread.name || null
                    });
                },
                onComplete: function() {
                    send(threads);
                }
            });
        "#.to_string();

        let result = self.execute_script(device_id, pid, &script).await?;
        
        // Parse threads from JSON result
        let threads: Vec<ThreadInfo> = serde_json::from_value(result)
            .context("Failed to parse threads from script output")?;
        
        Ok(threads)
    }

    /// Execute shell command on device
    pub async fn execute_shell_command(
        &self,
        device_id: &str,
        command: &str,
    ) -> Result<String> {
        debug!("Executing shell command on device {}: {}", device_id, command);
        
        let script = format!(
            r#"
            try {{
                var output = Java.use("android.widget.Toast").$new();
                // Execute command using Runtime
                var Process = Java.use("java.lang.Process");
                var Runtime = Java.use("java.lang.Runtime");
                var process = Runtime.getRuntime().exec("{}");
                var reader = Java.use("java.io.BufferedReader").$new(
                    Java.use("java.io.InputStreamReader").$new(process.getInputStream())
                );
                var line = "";
                var output = "";
                while ((line = reader.readLine()) != null) {{
                    output += line + "\n";
                }}
                send({{
                    success: true,
                    output: output
                }});
            }} catch (e) {{
                send({{
                    success: false,
                    error: e.message
                }});
            }}
            "#,
            command
        );

        // This needs to be executed on a Java process, so we'll need to handle it differently
        // For now, return a placeholder
        Ok("Shell command execution requires Java environment".to_string())
    }

    /// Get module information
    pub async fn enumerate_modules(&self, device_id: &str, pid: u32) -> Result<Vec<serde_json::Value>> {
        debug!("Enumerating modules for process {} on device {}", pid, device_id);
        
        let script = r#"
            var modules = [];
            Process.enumerateModules({
                onMatch: function(module) {
                    modules.push({
                        name: module.name,
                        base: module.base.toString(),
                        size: module.size,
                        path: module.path
                    });
                },
                onComplete: function() {
                    send(modules);
                }
            });
        "#.to_string();

        let result = self.execute_script(device_id, pid, &script).await?;
        
        // Parse modules from JSON result
        let modules: Vec<serde_json::Value> = serde_json::from_value(result)
            .context("Failed to parse modules from script output")?;
        
        Ok(modules)
    }

    /// Find exports in a module
    pub async fn enumerate_exports(
        &self,
        device_id: &str,
        pid: u32,
        module_name: &str,
    ) -> Result<Vec<serde_json::Value>> {
        debug!(
            "Enumerating exports for module {} in process {} on device {}",
            module_name, pid, device_id
        );
        
        let script = format!(
            r#"
            var exports = [];
            var module = Process.findModuleByName("{}");
            if (module) {{
                module.enumerateExports().forEach(function(exp) {{
                    exports.push({{
                        name: exp.name,
                        address: exp.address.toString(),
                        type: exp.type
                    }});
                }});
                send(exports);
            }} else {{
                send({{ error: "Module not found" }});
            }}
            "#,
            module_name
        );

        let result = self.execute_script(device_id, pid, &script).await?;
        
        // Parse exports from JSON result
        let exports: Vec<serde_json::Value> = serde_json::from_value(result)
            .context("Failed to parse exports from script output")?;
        
        Ok(exports)
    }

    /// Find symbols in a module
    pub async fn enumerate_symbols(
        &self,
        device_id: &str,
        pid: u32,
        module_name: &str,
    ) -> Result<Vec<serde_json::Value>> {
        debug!(
            "Enumerating symbols for module {} in process {} on device {}",
            module_name, pid, device_id
        );
        
        let script = format!(
            r#"
            var symbols = [];
            var module = Process.findModuleByName("{}");
            if (module) {{
                module.enumerateSymbols().forEach(function(sym) {{
                    symbols.push({{
                        name: sym.name,
                        address: sym.address.toString(),
                        type: sym.type
                    }});
                }});
                send(symbols);
            }} else {{
                send({{ error: "Module not found" }});
            }}
            "#,
            module_name
        );

        let result = self.execute_script(device_id, pid, &script).await?;

        // Parse symbols from JSON result
        let symbols: Vec<serde_json::Value> = serde_json::from_value(result)
            .context("Failed to parse symbols from script output")?;

        Ok(symbols)
    }

    /// Helper function for robust JSON parsing with fallback
    fn parse_json_fallback<T: for<'de> Deserialize<'de>>(
        &self,
        value: &serde_json::Value,
        default: T,
    ) -> T {
        serde_json::from_value(value.clone()).unwrap_or(default)
    }

    /// Parse JSON with detailed error context
    fn parse_json_with_context<T: for<'de> Deserialize<'de>>(
        &self,
        value: &serde_json::Value,
        context: &str,
    ) -> Result<T> {
        serde_json::from_value(value.clone())
            .map_err(|e| {
                warn!("JSON parsing error in {}: {}", context, e);
                anyhow::anyhow!("Failed to parse JSON in {}: {}", context, e)
            })
    }
}
