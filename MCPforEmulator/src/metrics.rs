use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

/// Metrics collector for monitoring server performance
#[derive(Clone)]
pub struct MetricsCollector {
    metrics: Arc<RwLock<ServerMetrics>>,
}

/// Server metrics data
#[derive(Debug, Serialize, Deserialize)]
pub struct ServerMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub tool_calls: HashMap<String, u64>,
    pub avg_request_duration_ms: f64,
    pub start_time: chrono::DateTime<chrono::Utc>,
}

impl Default for ServerMetrics {
    fn default() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            tool_calls: HashMap::new(),
            avg_request_duration_ms: 0.0,
            start_time: chrono::Utc::now(),
        }
    }
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(ServerMetrics::default())),
        }
    }

    /// Record a request start
    pub async fn record_request_start(&self) -> Instant {
        Instant::now()
    }

    /// Record a successful request
    pub async fn record_request_success(&self, duration: Duration, tool_name: Option<&str>) {
        let mut metrics = self.metrics.write().await;
        metrics.total_requests += 1;
        metrics.successful_requests += 1;

        // Update average duration
        let duration_ms = duration.as_secs_f64() * 1000.0;
        metrics.avg_request_duration_ms = (metrics.avg_request_duration_ms * (metrics.total_requests - 1) as f64 + duration_ms) / metrics.total_requests as f64;

        // Track tool calls
        if let Some(tool) = tool_name {
            *metrics.tool_calls.entry(tool.to_string()).or_insert(0) += 1;
        }
    }

    /// Record a failed request
    pub async fn record_request_failure(&self, duration: Duration, tool_name: Option<&str>) {
        let mut metrics = self.metrics.write().await;
        metrics.total_requests += 1;
        metrics.failed_requests += 1;

        // Update average duration
        let duration_ms = duration.as_secs_f64() * 1000.0;
        metrics.avg_request_duration_ms = (metrics.avg_request_duration_ms * (metrics.total_requests - 1) as f64 + duration_ms) / metrics.total_requests as f64;

        // Track tool calls
        if let Some(tool) = tool_name {
            *metrics.tool_calls.entry(tool.to_string()).or_insert(0) += 1;
        }
    }

    /// Get current metrics
    pub async fn get_metrics(&self) -> ServerMetrics {
        let metrics = self.metrics.read().await;
        metrics.clone()
    }

    /// Reset metrics
    pub async fn reset(&self) {
        let mut metrics = self.metrics.write().await;
        *metrics = ServerMetrics::default();
    }

    /// Get success rate
    pub async fn get_success_rate(&self) -> f64 {
        let metrics = self.metrics.read().await;
        if metrics.total_requests == 0 {
            0.0
        } else {
            metrics.successful_requests as f64 / metrics.total_requests as f64
        }
    }

    /// Get uptime
    pub async fn get_uptime(&self) -> Duration {
        let metrics = self.metrics.read().await;
        chrono::Utc::now().signed_duration_since(metrics.start_time).to_std().unwrap_or(Duration::ZERO)
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}
