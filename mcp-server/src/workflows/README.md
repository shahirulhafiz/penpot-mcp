# Penpot MCP Workflows

This directory contains modular, plug-and-play workflows for the Penpot MCP Server.

## What is a Workflow?

A workflow is a self-contained package of related tools, task handlers, and prompts that work together to provide specific functionality. Workflows are automatically discovered and loaded by the WorkflowManager.

## Directory Structure

```
workflows/
├── core/                   # Core workflow (essential tools)
│   ├── workflow.yml
│   ├── prompts.yml
│   ├── tools/
│   └── tasks/
├── my-workflow/            # Your custom workflow
│   ├── workflow.yml        # Required: Workflow manifest
│   ├── prompts.yml         # Optional: AI instructions
│   ├── tools/              # Optional: MCP tools
│   └── tasks/              # Optional: Plugin tasks
└── README.md               # This file
```

## Creating a Workflow

### 1. Create Directory

```bash
mkdir workflows/my-workflow
cd workflows/my-workflow
```

### 2. Create Manifest (`workflow.yml`)

```yaml
name: my-workflow
version: 1.0.0
description: Description of what this workflow does
enabled: true

tools:
  - MyTool

prompts: prompts.yml

metadata:
  author: Your Name
  tags:
    - example
```

### 3. Create Tools (Optional)

Create `tools/MyTool.ts`:

```typescript
import { z } from "zod";
import { Tool } from "../../../Tool";
import { PenpotMcpServer } from "../../../PenpotMcpServer";
import { ToolResponse, TextResponse } from "../../../ToolResponse";

export class MyTool extends Tool<{ message: string }> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            message: z.string().describe("A message"),
        });
    }

    getToolName(): string {
        return "my_tool";
    }

    getToolDescription(): string {
        return "Does something with Penpot";
    }

    protected async executeCore(args: { message: string }): Promise<ToolResponse> {
        // Your tool logic here
        return new TextResponse(`Processed: ${args.message}`);
    }
}
```

### 4. Create Prompts (Optional)

Create `prompts.yml`:

```yaml
workflow_instructions: |
  # My Workflow Instructions
  
  This workflow provides tools for...
  
  Usage: "Do something with my_tool"
```

### 5. Enable Workflow

Edit `mcp-server/data/workflows.yml`:

```yaml
workflows:
  my-workflow:
    enabled: true
```

Or use environment variable:

```bash
export PENPOT_MCP_WORKFLOW_MY_WORKFLOW=true
```

### 6. Build and Run

```bash
npm run build:all
npm run start:all
```

Your workflow will be automatically discovered, tools registered, and prompts merged!

## Built-in Workflows

### Core Workflow

The `core` workflow provides essential Penpot MCP functionality:

- **execute_code** - Execute JavaScript in the plugin context
- **export_shape** - Export shapes as PNG/SVG
- **import_image** - Import images into the design
- **high_level_overview** - Get Penpot API documentation overview
- **penpot_api_info** - Get detailed API type information

This workflow is always enabled by default.

## Configuration

### Global Settings (`mcp-server/data/workflows.yml`)

```yaml
settings:
  auto_discover: true              # Auto-discover workflows
  workflows_dir: "./workflows"     # Workflows directory
  load_external_workflows: false   # Load from node_modules

workflows:
  my-workflow:
    enabled: true
    config:
      custom_setting: value
```

### Environment Variables

Override enabled state for any workflow:

```bash
PENPOT_MCP_WORKFLOW_CORE=true
PENPOT_MCP_WORKFLOW_MY_WORKFLOW=false
```

Priority: **Environment Variable > Config File > Manifest Default**

## Advanced Topics

### Dependencies

Workflows can depend on other workflows:

```yaml
name: advanced-workflow
requires:
  - core
  - design-tokens
```

### External Workflows

Publish workflows as npm packages:

```json
{
  "name": "@myorg/penpot-workflow-awesome",
  "penpotWorkflow": {
    "manifest": "./workflow.yml"
  }
}
```

Install and use:

```bash
npm install @myorg/penpot-workflow-awesome
```

Enable in config:

```yaml
settings:
  load_external_workflows: true
```

## API Reference

### WorkflowManager

```typescript
import { WorkflowManager } from "../WorkflowManager";

const manager = new WorkflowManager(mcpServer, baseDir);

// Load configuration
await manager.loadConfiguration("workflows.yml");

// Discover workflows
const result = await manager.discoverWorkflows();

// Control workflows
await manager.enableWorkflow("my-workflow");
manager.disableWorkflow("my-workflow");

// Get tools and prompts
const tools = manager.getEnabledTools();
const prompts = manager.getCombinedPrompts();
```

### ToolRegistry

```typescript
import { ToolRegistry } from "../registry/ToolRegistry";

const registry = ToolRegistry.getInstance();
registry.register(myTool);
const tools = registry.getTools();
```

## Best Practices

1. **Single Responsibility** - Each workflow should focus on one domain
2. **Clear Naming** - Use descriptive workflow and tool names
3. **Good Prompts** - Provide clear instructions for AI agents
4. **Semantic Versioning** - Version your workflows properly
5. **Test Thoroughly** - Test workflows in isolation and with others

## Troubleshooting

### Workflow Not Discovered

- Check workflow.yml is valid YAML
- Ensure `enabled: true` in manifest
- Verify directory is in `workflows/`
- Check server logs for errors

### Tools Not Registered

- Verify tool class name in manifest matches file
- Check tool class is exported
- Ensure tool extends `Tool` base class
- Look for build errors

### Import Errors

- Use correct relative paths from workflow directory
- Import from `@penpot-mcp/common` for shared types
- Check that common package is built

## Examples

See the `core` workflow for a complete reference implementation.

## Documentation

For more information, see:
- [Creating Custom Workflows Guide](../../../docs/workflows/Creating-Custom-Workflows-Guide.md)
- [Local Development](../../../docs/local-development.md)
