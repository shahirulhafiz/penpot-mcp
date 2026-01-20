# =============================================================================
# Penpot MCP Server - Docker Build
# =============================================================================
# Multi-stage build for optimal image size
# Supports both single-user and multi-user modes
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Stage
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package*.json ./
COPY common/package*.json ./common/
COPY mcp-server/package*.json ./mcp-server/
COPY penpot-plugin/package*.json ./penpot-plugin/

# Copy source files needed for build
COPY common/ ./common/
COPY mcp-server/ ./mcp-server/
COPY penpot-plugin/ ./penpot-plugin/

# Install root dependencies
RUN npm install --include=dev

# Build common first (dependency for others)
RUN cd common && npm install --include=dev && npm run build

# Install mcp-server dependencies
RUN cd mcp-server && npm install --include=dev

# Copy built common package into mcp-server's node_modules (workaround for file: symlinks in Docker)
RUN rm -rf mcp-server/node_modules/@penpot-mcp/common && \
    mkdir -p mcp-server/node_modules/@penpot-mcp && \
    cp -r common mcp-server/node_modules/@penpot-mcp/common

# Build mcp-server
RUN cd mcp-server && npm run build

# Install penpot-plugin dependencies
RUN cd penpot-plugin && npm install --include=dev

# Copy built common package into penpot-plugin's node_modules
RUN rm -rf penpot-plugin/node_modules/@penpot-mcp/common && \
    mkdir -p penpot-plugin/node_modules/@penpot-mcp && \
    cp -r common penpot-plugin/node_modules/@penpot-mcp/common

# Build penpot-plugin (for multi-user mode deployment)
ARG MULTI_USER_MODE=true
RUN cd penpot-plugin && \
    if [ "$MULTI_USER_MODE" = "true" ]; then \
        npm run build:multi-user; \
    else \
        npm run build; \
    fi

# -----------------------------------------------------------------------------
# Stage 2: Production Stage - MCP Server
# -----------------------------------------------------------------------------
FROM node:22-alpine AS mcp-server

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache tini

# Create non-root user for security
RUN addgroup -g 1001 -S penpot && \
    adduser -S penpot -u 1001 -G penpot

# Copy package files
COPY package*.json ./
COPY common/package*.json ./common/
COPY mcp-server/package*.json ./mcp-server/

# Copy built artifacts from builder stage
COPY --from=builder /app/common/dist ./common/dist
COPY --from=builder /app/mcp-server/dist ./mcp-server/dist
COPY --from=builder /app/mcp-server/data ./mcp-server/data
# Also copy data to /app/data for the mcp-server which looks for it relative to cwd
COPY --from=builder /app/mcp-server/data ./data

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || true
RUN cd common && npm install --omit=dev --ignore-scripts 2>/dev/null || true
RUN cd mcp-server && npm install --omit=dev

# Change ownership to non-root user
RUN chown -R penpot:penpot /app

USER penpot

# Environment variables with defaults
ENV NODE_ENV=production
ENV PENPOT_MCP_SERVER_PORT=4401
ENV PENPOT_MCP_WEBSOCKET_PORT=4402
ENV PENPOT_MCP_REPL_PORT=4403
ENV PENPOT_MCP_SERVER_LISTEN_ADDRESS=0.0.0.0
ENV PENPOT_MCP_SERVER_ADDRESS=localhost
ENV PENPOT_MCP_REMOTE_MODE=true

# Expose ports
EXPOSE 4401 4402 4403

# Health check disabled - MCP uses streaming endpoints that don't work with simple HTTP checks
# Supervisor handles process restarts automatically
# HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
#     CMD wget --no-verbose --tries=1 http://localhost:4401/sse || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command (can be overridden for multi-user mode)
CMD ["node", "mcp-server/dist/index.js"]

# -----------------------------------------------------------------------------
# Stage 3: Production Stage - Plugin Server (optional, for serving plugin assets)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS plugin-server

WORKDIR /app

RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 -S penpot && \
    adduser -S penpot -u 1001 -G penpot

# Copy built plugin assets
COPY --from=builder /app/penpot-plugin/dist ./penpot-plugin/dist
COPY --from=builder /app/penpot-plugin/public ./penpot-plugin/public

# Install a simple static file server
RUN npm install -g serve

RUN chown -R penpot:penpot /app

USER penpot

ENV NODE_ENV=production

EXPOSE 4400

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4400/manifest.json || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

# Serve the plugin dist directory with CORS enabled
CMD ["serve", "-s", "penpot-plugin/dist", "-l", "4400", "--cors"]

# -----------------------------------------------------------------------------
# Stage 4: All-in-one (MCP Server + Plugin Server)
# For simpler deployments where both services run in one container
# -----------------------------------------------------------------------------
FROM node:22-alpine AS all-in-one

WORKDIR /app

RUN apk add --no-cache tini supervisor

# Create non-root user
RUN addgroup -g 1001 -S penpot && \
    adduser -S penpot -u 1001 -G penpot

# Copy package files
COPY package*.json ./
COPY common/package*.json ./common/
COPY mcp-server/package*.json ./mcp-server/

# Copy built artifacts
COPY --from=builder /app/common/dist ./common/dist
COPY --from=builder /app/mcp-server/dist ./mcp-server/dist
COPY --from=builder /app/mcp-server/data ./mcp-server/data
# Also copy data to /app/data for the mcp-server which looks for it relative to cwd
COPY --from=builder /app/mcp-server/data ./data
COPY --from=builder /app/penpot-plugin/dist ./penpot-plugin/dist
COPY --from=builder /app/penpot-plugin/public ./penpot-plugin/public

# Install dependencies
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || true
RUN cd common && npm install --omit=dev --ignore-scripts 2>/dev/null || true
RUN cd mcp-server && npm install --omit=dev
RUN npm install -g serve

# Create supervisor config
RUN mkdir -p /etc/supervisor/conf.d
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/dev/stdout
logfile_maxbytes=0

[program:mcp-server]
command=node /app/mcp-server/dist/index.js %(ENV_MCP_SERVER_ARGS)s
directory=/app
user=penpot
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:plugin-server]
command=serve -s /app/penpot-plugin/dist -l 4400 --cors
directory=/app
user=penpot
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

RUN chown -R penpot:penpot /app

# Environment variables
ENV NODE_ENV=production
ENV PENPOT_MCP_SERVER_PORT=4401
ENV PENPOT_MCP_WEBSOCKET_PORT=4402
ENV PENPOT_MCP_REPL_PORT=4403
ENV PENPOT_MCP_SERVER_LISTEN_ADDRESS=0.0.0.0
ENV PENPOT_MCP_SERVER_ADDRESS=localhost
ENV PENPOT_MCP_REMOTE_MODE=true
ENV MCP_SERVER_ARGS=""

# Expose all ports
EXPOSE 4400 4401 4402 4403

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
