use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Session information for a Frida attachment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub device_id: String,
    pub pid: u32,
    pub target: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
    pub status: SessionStatus,
}

/// Session status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Active,
    Idle,
    Error,
    Closed,
}

/// Session manager for tracking Frida attachments
#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new session
    pub async fn create_session(
        &self,
        device_id: String,
        pid: u32,
        target: String,
    ) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        let session = Session {
            id: session_id.clone(),
            device_id,
            pid,
            target,
            created_at: now,
            last_activity: now,
            status: SessionStatus::Active,
        };

        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), session);

        info!("Created session: {}", session_id);
        Ok(session_id)
    }

    /// Get a session by ID
    pub async fn get_session(&self, session_id: &str) -> Option<Session> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }

    /// Update session activity
    pub async fn update_activity(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.last_activity = chrono::Utc::now();
            session.status = SessionStatus::Active;
            debug!("Updated activity for session: {}", session_id);
            Ok(())
        } else {
            warn!("Session not found for activity update: {}", session_id);
            Err(anyhow::anyhow!("Session not found"))
        }
    }

    /// Close a session
    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.status = SessionStatus::Closed;
            info!("Closed session: {}", session_id);
            Ok(())
        } else {
            warn!("Session not found for close: {}", session_id);
            Err(anyhow::anyhow!("Session not found"))
        }
    }

    /// Mark session as error
    pub async fn mark_session_error(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.status = SessionStatus::Error;
            warn!("Marked session as error: {}", session_id);
            Ok(())
        } else {
            warn!("Session not found for error marking: {}", session_id);
            Err(anyhow::anyhow!("Session not found"))
        }
    }

    /// List all active sessions
    pub async fn list_sessions(&self) -> Vec<Session> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    /// Clean up idle sessions (older than specified duration)
    pub async fn cleanup_idle_sessions(&self, max_idle_seconds: i64) -> usize {
        let mut sessions = self.sessions.write().await;
        let now = chrono::Utc::now();
        let mut removed_count = 0;

        sessions.retain(|session_id, session| {
            let idle_duration = now.signed_duration_since(session.last_activity);
            let should_keep = idle_duration.num_seconds() < max_idle_seconds;

            if !should_keep {
                info!("Removing idle session: {} (idle for {} seconds)", session_id, idle_duration.num_seconds());
                removed_count += 1;
            }

            should_keep
        });

        removed_count
    }

    /// Get session count by device
    pub async fn get_device_session_count(&self, device_id: &str) -> usize {
        let sessions = self.sessions.read().await;
        sessions
            .values()
            .filter(|s| s.device_id == device_id && matches!(s.status, SessionStatus::Active))
            .count()
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
