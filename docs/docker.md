# Running Penpot MCP with Docker

This guide explains how to run the Penpot MCP server as a Docker service.

## Quick Start

### All-in-One (Recommended for Testing)

The simplest way to run both the MCP server and plugin server:

```bash
docker compose up
```

This starts:
- **Plugin Server** on port `4400`
- **MCP HTTP/SSE endpoint** on port `4401`
- **WebSocket bridge** on port `4402`
- **REPL server** on port `4403`

### Build Only

To build the Docker image without starting:

```bash
docker compose build
```

## Deployment Options

### Option 1: All-in-One Container (Default)

Best for simple deployments and testing. Runs both services in one container.

```bash
docker compose up -d
```

### Option 2: Separate Services (Production)

For production deployments where you want separate containers:

```bash
docker compose --profile production up -d
```

This starts:
- `mcp-server` - The MCP server only
- `plugin-server` - Static file server for the Penpot plugin

### Option 3: Multi-User Mode

For shared server deployments with user authentication:

```bash
docker compose --profile multi-user-only up -d
```

Or with the all-in-one approach using environment variable:

```bash
docker compose up -d
docker compose exec penpot-mcp node mcp-server/dist/index.js --multi-user
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PENPOT_MCP_SERVER_PORT` | `4401` | HTTP/SSE endpoint port |
| `PENPOT_MCP_WEBSOCKET_PORT` | `4402` | WebSocket port for plugin bridge |
| `PENPOT_MCP_REPL_PORT` | `4403` | REPL server port |
| `PENPOT_MCP_SERVER_LISTEN_ADDRESS` | `0.0.0.0` | Address to bind to |
| `PENPOT_MCP_SERVER_ADDRESS` | `localhost` | External address for clients |
| `PENPOT_MCP_REMOTE_MODE` | `true` | Enable remote mode (disables file system access) |

### Custom Server Address

When deploying to a server, set `PENPOT_MCP_SERVER_ADDRESS` to your domain or IP:

```bash
PENPOT_MCP_SERVER_ADDRESS=mcp.example.com docker compose up -d
```

Or create a `.env` file:

```env
PENPOT_MCP_SERVER_ADDRESS=mcp.example.com
```

## Connecting to the Server

### MCP Client Configuration

Configure your MCP client (e.g., Claude Desktop, Cursor) to connect to:

```
http://your-server:4401/mcp
```

For multi-user mode, include the user token:

```
http://your-server:4401/mcp?userToken=YOUR_TOKEN
```

### Loading the Penpot Plugin

1. Open Penpot and navigate to a design file
2. Open the Plugins panel
3. Load plugin from URL: `http://your-server:4400/manifest.json`
4. Click "Connect to MCP server"

## Docker Commands Reference

### Starting Services

```bash
# Default (all-in-one)
docker compose up -d

# Production (separate services)
docker compose --profile production up -d

# Multi-user mode
docker compose --profile multi-user-only up -d
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f penpot-mcp
docker compose logs -f mcp-server
```

### Stopping Services

```bash
docker compose down
```

### Rebuilding After Changes

```bash
docker compose build --no-cache
docker compose up -d
```

## Building Individual Images

You can build specific targets from the Dockerfile:

```bash
# MCP Server only
docker build --target mcp-server -t penpot-mcp-server .

# Plugin Server only
docker build --target plugin-server -t penpot-mcp-plugin .

# All-in-one
docker build --target all-in-one -t penpot-mcp .
```

## Health Checks

All services include health checks:

```bash
# Check health status
docker compose ps

# Manual health check
curl http://localhost:4401/mcp
curl http://localhost:4400/manifest.json
```

## Limitations in Docker/Remote Mode

When running in Docker (remote mode), the following features are disabled:
- **File system access**: Import and export tools cannot read/write local files
- Tools that require local file system access will be unavailable

This is because the container cannot access the client's local file system.

## Troubleshooting

### Container Won't Start

Check the logs:
```bash
docker compose logs penpot-mcp
```

### Connection Refused

1. Verify the container is running: `docker compose ps`
2. Check port mappings are correct
3. Ensure firewall allows traffic on ports 4400-4403

### WebSocket Connection Issues

If the plugin can't connect via WebSocket:
1. Verify port 4402 is exposed and accessible
2. Check `PENPOT_MCP_SERVER_ADDRESS` matches how clients reach the server
3. For HTTPS deployments, you may need a reverse proxy for WSS

### Mixed Content Warnings

If your Penpot instance uses HTTPS but the MCP server uses HTTP:
1. Deploy MCP behind an HTTPS reverse proxy (nginx, traefik, etc.)
2. Or configure your browser to allow mixed content for development

## Example: Nginx Reverse Proxy

For production with HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # MCP HTTP endpoint
    location /mcp {
        proxy_pass http://localhost:4401/mcp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SSE endpoint
    location /sse {
        proxy_pass http://localhost:4401/sse;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://localhost:4402;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Plugin assets
    location / {
        proxy_pass http://localhost:4400;
    }
}
```
