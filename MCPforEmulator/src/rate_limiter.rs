use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// Rate limiter for preventing abuse of operations
#[derive(Clone)]
pub struct RateLimiter {
    /// Track request counts per client/device
    requests: Arc<RwLock<HashMap<String, RequestTracker>>>,
    /// Maximum requests per window
    max_requests: usize,
    /// Time window for rate limiting
    window: Duration,
}

/// Tracks requests for a specific client/device
struct RequestTracker {
    count: usize,
    window_start: Instant,
}

impl RateLimiter {
    /// Create a new rate limiter
    pub fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            max_requests,
            window: Duration::from_secs(window_secs),
        }
    }

    /// Check if a request is allowed for the given key
    pub async fn check_rate_limit(&self, key: &str) -> Result<(), RateLimitError> {
        let mut requests = self.requests.write().await;
        let now = Instant::now();

        let tracker = requests.entry(key.to_string()).or_insert_with(|| RequestTracker {
            count: 0,
            window_start: now,
        });

        // Reset if window has expired
        if now.duration_since(tracker.window_start) >= self.window {
            tracker.count = 0;
            tracker.window_start = now;
        }

        // Check if limit exceeded
        if tracker.count >= self.max_requests {
            warn!("Rate limit exceeded for key: {}", key);
            return Err(RateLimitError::LimitExceeded {
                key: key.to_string(),
                limit: self.max_requests,
                window_secs: self.window.as_secs(),
            });
        }

        // Increment counter
        tracker.count += 1;
        debug!("Request allowed for key: {} (count: {})", key, tracker.count);

        Ok(())
    }

    /// Get current request count for a key
    pub async fn get_request_count(&self, key: &str) -> usize {
        let requests = self.requests.read().await;
        requests.get(key).map(|t| t.count).unwrap_or(0)
    }

    /// Reset rate limit for a specific key
    pub async fn reset(&self, key: &str) {
        let mut requests = self.requests.write().await;
        requests.remove(key);
    }

    /// Clean up expired entries
    pub async fn cleanup(&self) {
        let mut requests = self.requests.write().await;
        let now = Instant::now();
        requests.retain(|_, tracker| {
            now.duration_since(tracker.window_start) < self.window
        });
    }
}

/// Rate limit error types
#[derive(Debug, thiserror::Error)]
pub enum RateLimitError {
    #[error("Rate limit exceeded for {key}: {limit} requests per {window_secs} seconds")]
    LimitExceeded {
        key: String,
        limit: usize,
        window_secs: u64,
    },
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new(100, 60) // 100 requests per minute by default
    }
}
