//! Authentication and authorization module
//!
//! This module provides JWT-based authentication and authorization
//! for the MCP Frida Android Server.

use anyhow::{Result, Context};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use crate::config::AuthConfig;

/// JWT Claims structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    /// Subject (user identifier)
    pub sub: String,
    /// Issuer
    pub iss: String,
    /// Audience
    pub aud: String,
    /// Expiration time
    pub exp: usize,
    /// Issued at time
    pub iat: usize,
    /// Custom claims
    #[serde(flatten)]
    pub custom: CustomClaims,
}

/// Custom claims for specific application needs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomClaims {
    /// User permissions
    pub permissions: Vec<String>,
    /// Session identifier
    pub session_id: String,
}

/// Authentication result
#[derive(Debug, Clone)]
pub struct AuthResult {
    /// Whether authentication was successful
    pub authenticated: bool,
    /// User claims if authenticated
    pub claims: Option<Claims>,
    /// Error message if authentication failed
    pub error: Option<String>,
}

/// Authentication manager
pub struct AuthManager {
    /// JWT encoding key
    encoding_key: EncodingKey,
    /// JWT decoding key
    decoding_key: DecodingKey,
    /// Token expiration duration in seconds
    expiration_duration: Duration,
    /// Issuer identifier
    issuer: String,
    /// Audience identifier
    audience: String,
    /// Whether authentication is enabled
    enabled: bool,
}

impl AuthManager {
    /// Create a new authentication manager from configuration
    ///
    /// # Errors
    ///
    /// Returns an error if JWT secret is not configured when auth is enabled
    pub fn from_config(config: &AuthConfig) -> Result<Self> {
        if !config.enabled {
            return Ok(Self {
                encoding_key: EncodingKey::from_secret(b"disabled"),
                decoding_key: DecodingKey::from_secret(b"disabled"),
                expiration_duration: Duration::hours(24),
                issuer: "disabled".to_string(),
                audience: "disabled".to_string(),
                enabled: false,
            });
        }

        let secret = config.jwt_secret.as_ref()
            .context("JWT secret must be configured when auth is enabled")?;

        let encoding_key = EncodingKey::from_secret(secret.as_ref());
        let decoding_key = DecodingKey::from_secret(secret.as_ref());

        let expiration_hours = config.jwt_expiration_hours.unwrap_or(24);
        let expiration_duration = Duration::hours(expiration_hours);

        let issuer = config.jwt_issuer.clone().unwrap_or_else(|_| "mcp-frida-android".to_string());
        let audience = config.jwt_audience.clone().unwrap_or_else(|_| "mcp-clients".to_string());

        Ok(Self {
            encoding_key,
            decoding_key,
            expiration_duration,
            issuer,
            audience,
            enabled: true,
        })
    }

    /// Create a new authentication manager with custom configuration
    pub fn with_config(
        secret: String,
        expiration_hours: i64,
        issuer: String,
        audience: String,
        enabled: bool,
    ) -> Self {
        let encoding_key = EncodingKey::from_secret(secret.as_ref());
        let decoding_key = DecodingKey::from_secret(secret.as_ref());
        let expiration_duration = Duration::hours(expiration_hours);

        Self {
            encoding_key,
            decoding_key,
            expiration_duration,
            issuer,
            audience,
            enabled,
        }
    }

    /// Check if authentication is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Generate a JWT token for a user
    ///
    /// # Arguments
    ///
    /// * `user_id` - User identifier
    /// * `permissions` - User permissions
    /// * `session_id` - Session identifier
    ///
    /// # Returns
    ///
    /// JWT token string
    pub fn generate_token(
        &self,
        user_id: String,
        permissions: Vec<String>,
        session_id: String,
    ) -> Result<String> {
        if !self.enabled {
            return Err(anyhow::anyhow!("Authentication is not enabled"));
        }

        let now = Utc::now();
        let exp = now + self.expiration_duration;

        let claims = Claims {
            sub: user_id,
            iss: self.issuer.clone(),
            aud: self.audience.clone(),
            exp: exp.timestamp() as usize,
            iat: now.timestamp() as usize,
            custom: CustomClaims {
                permissions,
                session_id,
            },
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .context("Failed to generate JWT token")
    }

    /// Validate a JWT token
    ///
    /// # Arguments
    ///
    /// * `token` - JWT token string
    ///
    /// # Returns
    ///
    /// Authentication result with claims if valid
    pub fn validate_token(&self, token: &str) -> AuthResult {
        if !self.enabled {
            return AuthResult {
                authenticated: true, // Allow all when auth is disabled
                claims: None,
                error: None,
            };
        }

        let validation = Validation::new(Algorithm::HS256);
        validation.set_issuer(&[&self.issuer]);
        validation.set_audience(&[&self.audience]);

        match decode::<Claims>(token, &self.decoding_key, &validation) {
            Ok(token_data) => AuthResult {
                authenticated: true,
                claims: Some(token_data.claims),
                error: None,
            },
            Err(err) => AuthResult {
                authenticated: false,
                claims: None,
                error: Some(format!("Token validation failed: {}", err)),
            },
        }
    }

    /// Check if a user has a specific permission
    ///
    /// # Arguments
    ///
    /// * `claims` - User claims
    /// * `permission` - Permission to check
    ///
    /// # Returns
    ///
    /// True if user has the permission
    pub fn has_permission(&self, claims: &Claims, permission: &str) -> bool {
        claims.custom.permissions.contains(&permission.to_string())
            || claims.custom.permissions.contains(&"*".to_string())
    }

    /// Check if a user has any of the specified permissions
    ///
    /// # Arguments
    ///
    /// * `claims` - User claims
    /// * `permissions` - Permissions to check
    ///
    /// # Returns
    ///
    /// True if user has any of the permissions
    pub fn has_any_permission(&self, claims: &Claims, permissions: &[&str]) -> bool {
        claims.custom.permissions.contains(&"*".to_string())
            || permissions
                .iter()
                .any(|p| claims.custom.permissions.contains(&p.to_string()))
    }
}

impl Default for AuthManager {
    fn default() -> Self {
        Self::with_config(
            "default_secret_change_in_production".to_string(),
            24,
            "mcp-frida-android".to_string(),
            "mcp-clients".to_string(),
            false,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_generation_and_validation() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            true,
        );

        let user_id = "test_user".to_string();
        let permissions = vec!["read".to_string(), "write".to_string()];
        let session_id = "test_session".to_string();

        let token = auth_manager
            .generate_token(user_id.clone(), permissions.clone(), session_id)
            .expect("Failed to generate token");

        let result = auth_manager.validate_token(&token);

        assert!(result.authenticated);
        assert!(result.error.is_none());
        assert!(result.claims.is_some());

        let claims = result.claims.unwrap();
        assert_eq!(claims.sub, user_id);
        assert_eq!(claims.custom.permissions, permissions);
    }

    #[test]
    fn test_invalid_token() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            true,
        );

        let invalid_token = "invalid_token_string";

        let result = auth_manager.validate_token(invalid_token);

        assert!(!result.authenticated);
        assert!(result.error.is_some());
        assert!(result.claims.is_none());
    }

    #[test]
    fn test_disabled_auth() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            false,
        );

        let result = auth_manager.validate_token("any_token");

        assert!(result.authenticated);
        assert!(!auth_manager.is_enabled());
    }

    #[test]
    fn test_permission_check() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            true,
        );

        let permissions = vec!["read".to_string(), "write".to_string()];
        let token = auth_manager
            .generate_token("user".to_string(), permissions, "session".to_string())
            .expect("Failed to generate token");

        let result = auth_manager.validate_token(&token);
        let claims = result.claims.unwrap();

        assert!(auth_manager.has_permission(&claims, "read"));
        assert!(auth_manager.has_permission(&claims, "write"));
        assert!(!auth_manager.has_permission(&claims, "admin"));
    }

    #[test]
    fn test_wildcard_permission() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            true,
        );

        let permissions = vec!["*".to_string()];
        let token = auth_manager
            .generate_token("admin".to_string(), permissions, "session".to_string())
            .expect("Failed to generate token");

        let result = auth_manager.validate_token(&token);
        let claims = result.claims.unwrap();

        assert!(auth_manager.has_permission(&claims, "read"));
        assert!(auth_manager.has_permission(&claims, "write"));
        assert!(auth_manager.has_permission(&claims, "admin"));
    }

    #[test]
    fn test_has_any_permission() {
        let auth_manager = AuthManager::with_config(
            "test_secret_key".to_string(),
            24,
            "test_issuer".to_string(),
            "test_audience".to_string(),
            true,
        );

        let permissions = vec!["read".to_string()];
        let token = auth_manager
            .generate_token("user".to_string(), permissions, "session".to_string())
            .expect("Failed to generate token");

        let result = auth_manager.validate_token(&token);
        let claims = result.claims.unwrap();

        assert!(auth_manager.has_any_permission(&claims, &["read", "write"]));
        assert!(!auth_manager.has_any_permission(&claims, &["admin", "write"]));
    }
}
