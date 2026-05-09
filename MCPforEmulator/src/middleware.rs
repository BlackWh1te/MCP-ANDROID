use axum::{
    extract::Request,
    http::HeaderMap,
    middleware::Next,
    response::Response,
};
use tracing::info_span;
use uuid::Uuid;

/// Middleware to add request ID to tracing span
pub async fn request_id_middleware(
    request: Request,
    next: Next,
) -> Response {
    // Generate or extract request ID
    let request_id = extract_or_generate_request_id(request.headers());

    // Create span with request ID
    let span = info_span!(
        "request",
        request_id = %request_id,
        method = %request.method(),
        path = %request.uri().path()
    );

    async move {
        // Enter the span for this request
        let _guard = span.enter();

        // Process the request
        next.run(request).await
    }
    .await
}

/// Extract request ID from headers or generate a new one
fn extract_or_generate_request_id(headers: &HeaderMap) -> String {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}
