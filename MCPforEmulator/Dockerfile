# Multi-stage Dockerfile for MCP Frida Android Server

# Stage 1: Build stage
FROM rust:1.75-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY . .

# Build the application
RUN cargo build --release

# Stage 2: Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    android-sdk-platform-tools \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Frida tools
RUN pip3 install frida-tools requests

# Copy the binary from builder stage
COPY --from=builder /app/target/release/mcp-frida-android /app/mcp-frida-android

# Copy configuration and tools
COPY config.toml /app/config.toml
COPY tools/ /app/tools/
COPY examples/ /app/examples/

# Create non-root user
RUN useradd -m -u 1000 mcpuser && \
    chown -R mcpuser:mcpuser /app
USER mcpuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the application
CMD ["./mcp-frida-android"]
