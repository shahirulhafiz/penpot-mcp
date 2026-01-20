# Running Locally with Penpot Dev Environment

This guide explains how to run the Penpot MCP project in development mode and connect it to a local instance of the Penpot application (e.g., running on `localhost:9001`).

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or later recommended)
- A running local instance of Penpot (backend + frontend)
- `npm` installed

## 1. Start the MCP Server and Plugin

The project includes a `bootstrap` script that installs dependencies, builds the project, and starts both the MCP server and the Plugin server.

1. Open your terminal in the project root (`penpot-mcp`).
2. Run the bootstrap command:

```bash
npm run build:all
npm run bootstrap
```

This command will:
* Install all dependencies.
* Build the packages.
* Start the **MCP Server** on port `4401` (HTTP/SSE) and `4402` (WebSocket).
* Start the **Plugin Server** on port `4400` (serving the plugin manifest and assets).

## 2. Connect Your Local Penpot UI

Assuming your local Penpot instance is running (e.g., at `http://localhost:9001`):

1. **Open Penpot:** Navigate to your local Penpot instance in your browser.
2. **Open a Design File:** Enter any project and open a design file.
3. **Load the Plugin:**
   * Open the **Plugins** panel (usually in the left sidebar or via the menu).
   * Look for an option to "Load Plugin from URL" or "Develop Plugin".
   * Enter the Plugin Manifest URL:
     ```
     http://localhost:4400/manifest.json
     ```
4. **Connect to MCP Server:**
   * Once loaded, open the Plugin UI.
   * Click **"Connect to MCP server"**.
   * The status should change to "Connected".

## Troubleshooting

### Connection Refused / WebSocket Errors
- Ensure the bootstrap command is still running in your terminal.
- Check that the plugin is trying to connect to `ws://localhost:4402`. You can inspect the plugin iframe console in your browser's developer tools.

### Network Restrictions
- If your local Penpot is running on `https` (unlikely for local dev, but possible) and the plugin is on `http`, you might face mixed content warnings. Ensure you allow insecure content for `localhost` or serve Penpot on `http`.
- Modern browsers (Chrome 142+) restrict private network access. If connecting from a non-localhost origin to `localhost`, you must approve the connection popup.

### Custom Ports
If your environment requires different ports, you can set them before running `bootstrap`:

- `PENPOT_MCP_SERVER_ADDRESS`: The address the plugin uses to find the MCP server (default: `localhost`)
- `PENPOT_MCP_WEBSOCKET_PORT`: The WebSocket port (default: `4402`)
- `PENPOT_MCP_PLUGIN_SERVER_LISTEN_ADDRESS`: Address for the plugin server (default: `localhost`)
