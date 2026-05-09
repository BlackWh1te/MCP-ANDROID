use anyhow::{Context, Result};
use async_process::{Command, Stdio};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::{sleep, timeout};
use tracing::{debug, info, warn};

use crate::config::Config;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub serial: String,
    pub model: String,
    pub device: String,
    pub product: String,
    pub transport_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Process {
    pub pid: u32,
    pub name: String,
    pub user: Option<String>,
}

pub struct AdbBridge {
    adb_path: String,
    timeout: Duration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub serial: String,
    pub model: String,
    pub status: String,
    pub is_connected: bool,
    pub can_execute_shell: bool,
}

impl AdbBridge {
    pub fn new(config: &Config) -> Self {
        let adb_path = crate::config::get_adb_path(config);
        let timeout = Duration::from_secs(config.adb.timeout_seconds);

        Self { adb_path, timeout }
    }

    /// Create a new ADB bridge with a custom path
    pub fn new_with_path(path: &str) -> Self {
        Self {
            adb_path: path.to_string(),
            timeout: Duration::from_secs(30), // Default timeout
        }
    }

    /// Execute command with retry logic for transient failures
    async fn execute_with_retry<F, Fut>(
        &self,
        operation: F,
        operation_name: &str,
        max_retries: u32,
    ) -> Result<async_process::Output>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<async_process::Output, anyhow::Error>>,
    {
        let mut last_error = None;

        for attempt in 0..=max_retries {
            match operation().await {
                Ok(output) => {
                    if output.status.success() {
                        return Ok(output);
                    }

                    // Check if error is retryable
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let is_retryable = self.is_retryable_error(&stderr);

                    if !is_retryable || attempt == max_retries {
                        return Ok(output);
                    }

                    warn!(
                        "{} attempt {} failed (retryable): {}",
                        operation_name, attempt + 1, stderr
                    );
                    last_error = Some(anyhow::anyhow!("{}", stderr));
                }
                Err(e) => {
                    if attempt == max_retries {
                        return Err(e);
                    }
                    warn!(
                        "{} attempt {} failed with error: {}",
                        operation_name, attempt + 1, e
                    );
                    last_error = Some(e);
                }
            }

            // Exponential backoff
            let backoff_duration = Duration::from_millis((100 * 2_u32.pow(attempt).min(8)) as u64);
            debug!("Retrying {} after {:?}", operation_name, backoff_duration);
            sleep(backoff_duration).await;
        }

        Err(last_error.unwrap_or_else(|| {
            anyhow::anyhow!("{} failed after {} retries", operation_name, max_retries)
        }))
    }

    /// Check if an error is retryable
    fn is_retryable_error(&self, error: &str) -> bool {
        let retryable_patterns = [
            "device offline",
            "connection refused",
            "timeout",
            "broken pipe",
            "transport error",
            "protocol fault",
        ];

        let error_lower = error.to_lowercase();
        retryable_patterns
            .iter()
            .any(|pattern| error_lower.contains(pattern))
    }

    /// List all connected devices
    pub async fn list_devices(&self) -> Result<Vec<Device>> {
        debug!("Listing connected devices");

        let output = self
            .execute_with_retry(
                || async {
                    timeout(
                        self.timeout,
                        Command::new(&self.adb_path)
                            .arg("devices")
                            .arg("-l")
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped())
                            .output(),
                    )
                    .await
                    .context("ADB devices command timed out")?
                    .context("Failed to execute ADB devices command")
                },
                "list_devices",
                3,
            )
            .await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB devices command failed: {}", error);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_devices(&stdout)
    }

    /// Get detailed device information
    pub async fn get_device_info(&self, serial: &str) -> Result<Device> {
        debug!("Getting device info for: {}", serial);
        
        let devices = self.list_devices().await?;
        devices
            .into_iter()
            .find(|d| d.serial == serial)
            .ok_or_else(|| anyhow::anyhow!("Device not found: {}", serial))
    }

    /// Check if device is connected
    pub async fn check_connection(&self, serial: &str) -> Result<bool> {
        debug!("Checking connection for device: {}", serial);

        let output = self
            .execute_with_retry(
                || async {
                    timeout(
                        self.timeout,
                        Command::new(&self.adb_path)
                            .arg("-s")
                            .arg(serial)
                            .arg("shell")
                            .arg("echo")
                            .arg("connected")
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped())
                            .output(),
                    )
                    .await
                    .context("ADB connection check timed out")?
                    .context("Failed to execute ADB connection check")
                },
                "check_connection",
                2,
            )
            .await?;

        if output.status.success() {
            // Also verify the device is in the device list
            let devices = self.list_devices().await?;
            let device_exists = devices.iter().any(|d| d.serial == serial);
            Ok(device_exists)
        } else {
            Ok(false)
        }
    }

    /// Get device status with detailed information
    pub async fn get_device_status(&self, serial: &str) -> Result<DeviceStatus> {
        debug!("Getting device status for: {}", serial);

        let devices = self.list_devices().await?;
        let device = devices
            .iter()
            .find(|d| d.serial == serial)
            .ok_or_else(|| anyhow::anyhow!("Device not found: {}", serial))?;

        let is_connected = self.check_connection(serial).await.unwrap_or(false);
        let can_execute_shell = self
            .shell_command(serial, "echo test")
            .await
            .is_ok();

        Ok(DeviceStatus {
            serial: device.serial.clone(),
            model: device.model.clone(),
            status: device.status.clone(),
            is_connected,
            can_execute_shell,
        })
    }

    /// List processes on the device
    pub async fn list_processes(&self, serial: &str) -> Result<Vec<Process>> {
        self.list_processes_filtered(serial, None, None).await
    }

    /// List processes with optional filtering
    pub async fn list_processes_filtered(
        &self,
        serial: &str,
        name_filter: Option<&str>,
        pid_filter: Option<u32>,
    ) -> Result<Vec<Process>> {
        debug!(
            "Listing processes for device: {} (name_filter: {:?}, pid_filter: {:?})",
            serial, name_filter, pid_filter
        );

        let output = timeout(self.timeout, Command::new(&self.adb_path)
            .arg("-s")
            .arg(serial)
            .arg("shell")
            .arg("ps")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("ADB ps command timed out")?
        .context("Failed to execute ADB ps command")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            warn!("ADB ps command failed: {}", error);
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut processes = self.parse_processes(&stdout)?;

        // Apply filters
        if let Some(name) = name_filter {
            processes.retain(|p| p.name.to_lowercase().contains(&name.to_lowercase()));
        }

        if let Some(pid) = pid_filter {
            processes.retain(|p| p.pid == pid);
        }

        debug!("Found {} processes after filtering", processes.len());
        Ok(processes)
    }

    /// Forward a port from device to host
    pub async fn forward_port(&self, serial: &str, device_port: u16, host_port: u16) -> Result<()> {
        info!(
            "Forwarding port: device:{} -> host:{} for device {}",
            device_port, host_port, serial
        );
        
        let output = timeout(self.timeout, Command::new(&self.adb_path)
            .arg("-s")
            .arg(serial)
            .arg("forward")
            .arg(format!("tcp:{}", host_port))
            .arg(format!("tcp:{}", device_port))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("ADB port forward command timed out")?
        .context("Failed to execute ADB port forward")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB port forward failed: {}", error);
        }

        Ok(())
    }

    /// Execute a shell command on the device
    pub async fn shell_command(&self, serial: &str, command: &str) -> Result<String> {
        debug!("Executing shell command on device {}: {}", serial, command);

        let output = self
            .execute_with_retry(
                || async {
                    timeout(
                        self.timeout,
                        Command::new(&self.adb_path)
                            .arg("-s")
                            .arg(serial)
                            .arg("shell")
                            .arg(command)
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped())
                            .output(),
                    )
                    .await
                    .context("ADB shell command timed out")?
                    .context("Failed to execute ADB shell command")
                },
                "shell_command",
                2,
            )
            .await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB shell command failed: {}", error);
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Push a file to the device
    pub async fn push_file(&self, serial: &str, local_path: &str, remote_path: &str) -> Result<()> {
        info!("Pushing file {} to device {}: {}", local_path, serial, remote_path);
        
        let output = timeout(self.timeout, Command::new(&self.adb_path)
            .arg("-s")
            .arg(serial)
            .arg("push")
            .arg(local_path)
            .arg(remote_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("ADB push command timed out")?
        .context("Failed to execute ADB push")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB push failed: {}", error);
        }

        Ok(())
    }

    /// Install an APK on the device
    pub async fn install_apk(&self, serial: &str, apk_path: &str) -> Result<String> {
        info!("Installing APK {} on device {}", apk_path, serial);
        
        let output = timeout(Duration::from_secs(120), Command::new(&self.adb_path)
            .arg("-s")
            .arg(serial)
            .arg("install")
            .arg("-r")  // Replace existing app
            .arg(apk_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("ADB install command timed out")?
        .context("Failed to execute ADB install")?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            anyhow::bail!("ADB install failed: {}", stderr);
        }

        Ok(stdout)
    }

    /// Uninstall a package from the device
    pub async fn uninstall_package(&self, serial: &str, package_name: &str) -> Result<String> {
        info!("Uninstalling package {} from device {}", package_name, serial);
        
        let output = timeout(self.timeout, Command::new(&self.adb_path)
            .arg("-s")
            .arg(serial)
            .arg("uninstall")
            .arg(package_name)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output())
        .await
        .context("ADB uninstall command timed out")?
        .context("Failed to execute ADB uninstall")?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // Don't fail if package doesn't exist
        Ok(stdout)
    }

    fn parse_devices(&self, output: &str) -> Result<Vec<Device>> {
        let mut devices = Vec::new();
        
        for line in output.lines().skip(1) {
            if line.trim().is_empty() {
                continue;
            }
            
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }
            
            let serial = parts[0].to_string();
            let status = parts[1].to_string();
            
            let mut model = "unknown".to_string();
            let mut device = "unknown".to_string();
            let mut product = "unknown".to_string();
            let mut transport_id = "unknown".to_string();
            
            for part in &parts[2..] {
                if let Some(val) = part.strip_prefix("model:") {
                    model = val.to_string();
                } else if let Some(val) = part.strip_prefix("device:") {
                    device = val.to_string();
                } else if let Some(val) = part.strip_prefix("product:") {
                    product = val.to_string();
                } else if let Some(val) = part.strip_prefix("transport_id:") {
                    transport_id = val.to_string();
                }
            }
            
            devices.push(Device {
                serial,
                model,
                device,
                product,
                transport_id,
                status,
            });
        }
        
        Ok(devices)
    }

    fn parse_processes(&self, output: &str) -> Result<Vec<Process>> {
        let mut processes = Vec::new();

        // Skip header line
        for line in output.lines().skip(1) {
            if line.trim().is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();

            // Handle different ps output formats
            // Standard format: USER PID PPID VSIZE RSS WCHAN PC NAME
            // Extended format may have additional columns
            if parts.len() >= 9 {
                let pid = parts[1].parse::<u32>().unwrap_or(0);
                let user = if !parts[0].is_empty() {
                    Some(parts[0].to_string())
                } else {
                    None
                };
                let name = parts[8].to_string();

                processes.push(Process { pid, name, user });
            } else if parts.len() >= 2 {
                // Fallback for minimal format
                let pid = parts[0].parse::<u32>().unwrap_or(0);
                let name = parts[1].to_string();
                processes.push(Process {
                    pid,
                    name,
                    user: None,
                });
            }
        }

        debug!("Parsed {} processes from ADB output", processes.len());
        Ok(processes)
    }
}
