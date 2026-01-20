# Comprehensive Guide: Creating Custom Penpot MCP Workflows

This guide provides everything you need to build your own custom workflows on top of the Penpot MCP Server. It consolidates architectural patterns, agentic flow design, property schemas, and implementation strategies.

**🎉 NEW: Modular Plug-and-Play Workflow System** - Workflows are now self-contained, discoverable packages that require zero changes to core files. See [Quick Start: Creating Your First Workflow](#quick-start-creating-your-first-workflow) to get started in minutes!

---

## Table of Contents

1. [Quick Start: Creating Your First Workflow](#quick-start-creating-your-first-workflow) ⭐ **NEW**
2. [Modular Workflow System](#modular-workflow-system) ⭐ **NEW**
3. [Architecture Overview](#architecture-overview)
4. [The Full-Duplex Communication Pattern](#the-full-duplex-communication-pattern)
5. [The Agentic Workflow Pattern](#the-agentic-workflow-pattern)
6. [Property Schema Reference](#property-schema-reference)
7. [Building Custom Tools](#building-custom-tools)
8. [Building Custom Resources](#building-custom-resources)
9. [System Prompts & Agent Instructions](#system-prompts--agent-instructions)
10. [Working with the Penpot Plugin API](#working-with-the-penpot-plugin-api)
11. [Implementation Walkthrough](#implementation-walkthrough)
12. [Best Practices & Anti-Patterns](#best-practices--anti-patterns)
13. [Troubleshooting](#troubleshooting)

---

## Quick Start: Creating Your First Workflow

Creating a custom workflow is now as simple as creating a directory with a manifest file!

### Step 1: Create Your Workflow Directory

```bash
cd mcp-server/src/workflows
mkdir my-awesome-workflow
cd my-awesome-workflow
```

### Step 2: Create a Workflow Manifest

Create `workflow.yml`:

```yaml
name: my-awesome-workflow
version: 1.0.0
description: My awesome custom workflow
enabled: true

tools:
  - MyAwesomeTool

prompts: prompts.yml

metadata:
  author: Your Name
  tags:
    - custom
    - awesome
```

### Step 3: Create Your Tool

Create `tools/MyAwesomeTool.ts`:

```typescript
import { z } from "zod";
import { Tool } from "../../../Tool";
import { PenpotMcpServer } from "../../../PenpotMcpServer";
import { ToolResponse, TextResponse } from "../../../ToolResponse";

export class MyAwesomeTool extends Tool<{ message: string }> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            message: z.string().describe("The message to display"),
        });
    }

    getToolName(): string {
        return "my_awesome_tool";
    }

    getToolDescription(): string {
        return "Does something awesome with Penpot designs";
    }

    protected async executeCore(args: { message: string }): Promise<ToolResponse> {
        const code = `
            const board = penpot.createBoard();
            board.name = "${args.message}";
            return { id: board.id, name: board.name };
        `;
        
        const result = await this.mcpServer.pluginBridge.executeCode(code);
        return new TextResponse(JSON.stringify(result, null, 2));
    }
}
```

### Step 4: Create Prompts (Optional)

Create `prompts.yml`:

```yaml
workflow_instructions: |
  # My Awesome Workflow
  
  This workflow provides the `my_awesome_tool` which creates boards with custom names.
  
  Usage example: "Create a board called 'Hero Section'"
```

### Step 5: Enable Your Workflow

Edit `mcp-server/data/workflows.yml`:

```yaml
workflows:
  my-awesome-workflow:
    enabled: true
```

### Step 6: Build and Run

```bash
npm run build:all
npm run start:all
```

**That's it!** Your workflow will be auto-discovered, tools will be registered, and prompts will be merged into the system instructions. No changes to core files needed!

---

## Modular Workflow System

The Penpot MCP Server now uses a **modular, plug-and-play workflow system** that makes it easy to create, share, and manage custom workflows.

### Key Features

- **🔍 Auto-Discovery**: Workflows are automatically discovered from the `workflows/` directory
- **📦 Self-Contained**: Each workflow is a standalone package with its own tools, handlers, and prompts
- **⚙️ Configurable**: Enable/disable workflows via config files or environment variables
- **🔌 Zero-Touch Core**: Add new workflows without modifying core server files
- **📚 NPM-Ready**: Workflows can be published as npm packages and shared

### Workflow Structure

```
mcp-server/src/workflows/
└── my-workflow/
    ├── workflow.yml          # Manifest (required)
    ├── prompts.yml           # AI instructions (optional)
    ├── tools/                # Server-side tools (optional)
    │   └── MyTool.ts
    └── tasks/                # Plugin tasks (optional)
        └── MyTask.ts

penpot-plugin/src/workflows/
└── my-workflow/
    └── task-handlers/        # Plugin-side handlers (optional)
        └── MyTaskHandler.ts
```

### Workflow Manifest

Every workflow must have a `workflow.yml` manifest:

```yaml
name: workflow-name          # Unique identifier
version: 1.0.0               # Semantic version
description: What it does    # Human-readable description
enabled: true                # Default enabled state

# Optional: List of tool classes
tools:
  - MyFirstTool
  - MySecondTool

# Optional: List of task handler classes
taskHandlers:
  - MyTaskHandler

# Optional: Path to prompts file
prompts: prompts.yml

# Optional: Path to types file
types: types.ts

# Optional: Dependencies on other workflows
requires:
  - core
  - design-tokens

# Optional: Metadata
metadata:
  author: Your Name
  repository: https://github.com/you/workflow
  license: MIT
  tags:
    - design-system
    - automation
```

### Configuration System

#### Global Configuration (`mcp-server/data/workflows.yml`)

```yaml
settings:
  auto_discover: true               # Auto-discover workflows
  workflows_dir: "./workflows"      # Workflows directory
  load_external_workflows: false    # Load from node_modules

workflows:
  my-workflow:
    enabled: true                   # Override manifest default
    config:                         # Workflow-specific config
      custom_option: value
```

#### Environment Variables

Override any workflow's enabled state:

```bash
# Enable a workflow
PENPOT_MCP_WORKFLOW_MY_WORKFLOW=true

# Disable a workflow
PENPOT_MCP_WORKFLOW_CORE=false
```

Priority: `Environment Variable > Config File > Manifest Default`

### Registry System

The modular system is built on two registries:

#### ToolRegistry (Server-Side)

```typescript
import { ToolRegistry } from "./registry/ToolRegistry";

const registry = ToolRegistry.getInstance();

// Manual registration
registry.register(myTool);

// Auto-discovery
await registry.discoverTools("./workflows/my-workflow/tools", mcpServer);

// Access tools
const tools = registry.getTools();
const tool = registry.getToolByName("my_tool");
```

#### TaskHandlerRegistry (Plugin-Side)

```typescript
import { TaskHandlerRegistry } from "./registry/TaskHandlerRegistry";

const registry = TaskHandlerRegistry.getInstance();

// Manual registration
registry.register(myHandler);

// Access handlers
const handler = registry.findHandler("myTask");
const allHandlers = registry.getHandlers();
```

### WorkflowManager

The WorkflowManager orchestrates workflow loading and management:

```typescript
import { WorkflowManager } from "./workflows/WorkflowManager";

const manager = new WorkflowManager(mcpServer, baseDir);

// Load configuration
await manager.loadConfiguration("workflows.yml");

// Discover workflows
const result = await manager.discoverWorkflows();
// result: { discovered: [...], failed: [...], total: N }

// Access workflows
const workflow = manager.getWorkflow("my-workflow");
const enabled = manager.getEnabledWorkflows();

// Control workflows
await manager.enableWorkflow("my-workflow");
manager.disableWorkflow("my-workflow");

// Get combined prompts
const prompts = manager.getCombinedPrompts();

// Get tools from all enabled workflows
const tools = manager.getEnabledTools();
```

### Publishing Workflows as NPM Packages

You can publish workflows as npm packages for easy sharing:

#### Package Structure

```
@myorg/penpot-workflow-awesome/
├── package.json
├── workflow.yml
├── tools/
│   └── AwesomeTool.ts
├── task-handlers/
│   └── AwesomeHandler.ts
└── prompts.yml
```

#### package.json

```json
{
  "name": "@myorg/penpot-workflow-awesome",
  "version": "1.0.0",
  "description": "Awesome workflow for Penpot MCP",
  "penpotWorkflow": {
    "manifest": "./workflow.yml"
  },
  "peerDependencies": {
    "@penpot-mcp/common": "^1.0.0"
  }
}
```

#### Installation

```bash
npm install @myorg/penpot-workflow-awesome
```

The WorkflowManager will automatically discover it from `node_modules` if `load_external_workflows` is enabled.

### Migration from Old System

If you have custom tools in the old system:

1. **Move to workflow structure**: Place tools in `workflows/custom/tools/`
2. **Create manifest**: Add `workflow.yml` with tool names
3. **Update imports**: Change import paths to new locations
4. **Remove manual registration**: Delete from `PenpotMcpServer.registerTools()`

The old system is still supported for backward compatibility, but all core tools have been migrated to the `core` workflow.

---

## Architecture Overview

The Penpot MCP Server uses a **Sidecar Architecture** for real-time bidirectional communication:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   AI Client     │◄────►│   MCP Server    │◄────►│  Penpot Plugin  │
│ (Claude/Cursor) │      │   (Node.js)     │      │   (Browser)     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
        │    MCP Protocol        │     WebSocket          │
        │   (HTTP/SSE/stdio)     │     (Port 4402)        │
        │                        │                        │
        └────────────────────────┴────────────────────────┘
```

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **MCP Server** | `mcp-server/` | Exposes tools to LLMs, handles HTTP/SSE endpoints |
| **Penpot Plugin** | `penpot-plugin/` | Runs in browser, executes code via Plugin API |
| **Common Types** | `common/` | Shared TypeScript definitions |
| **WebSocket Bridge** | `PluginBridge.ts` | Connects server ↔ plugin for real-time communication |

### Key Files for Customization

```
penpot-mcp/
├── common/src/
│   └── types.ts              # Add custom task types here
├── mcp-server/src/
│   ├── PenpotMcpServer.ts    # Register new tools here
│   ├── Tool.ts               # Base class for tools
│   └── tools/                # Add custom tools here
│       ├── ExecuteCodeTool.ts
│       ├── ExportShapeTool.ts
│       └── [YourCustomTool].ts
└── penpot-plugin/src/
    ├── PenpotUtils.ts        # Utility functions for design operations
    ├── plugin.ts             # Plugin entry point
    └── task-handlers/        # Add custom task handlers here
        └── ExecuteCodeTaskHandler.ts
```

---

## 2. The Full-Duplex Communication Pattern

Unlike REST APIs, the Full-Duplex pattern enables the AI to **see** user selections and **act** on them in real-time.

### Data Flow

```
1. User Action     → User selects a frame in Penpot
2. Plugin (Browser)→ Detects `selectionchange`, sends JSON via WebSocket
3. MCP Server      → Updates internal state (cached selection)
4. AI Agent        → Reads the resource to understand context
5. AI Decision     → Determines action based on selection
6. Tool Execution  → Sends command back through WebSocket
7. Plugin          → Executes Penpot API calls
8. Design Updated  → User sees changes in real-time
```

### Implementing Selection Tracking

In `penpot-plugin/src/plugin.ts`:

```typescript
// Listen for selection changes
penpot.on('selectionchange', () => {
  const selection = penpot.selection;
  if (selection.length > 0) {
    // Extract validated properties
    const tree = PenpotUtils.shapeStructure(selection[0], 3);
    
    // Send to MCP Server via WebSocket
    socket.send(JSON.stringify({
      type: 'selection_update',
      payload: tree
    }));
  }
});
```

In `mcp-server/src/PenpotMcpServer.ts`, expose as a resource:

```typescript
server.resource(
  "penpot://selection",
  "The currently selected node in Penpot. READ THIS FIRST.",
  async (uri) => {
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(lastSelectionState)
      }]
    };
  }
);
```

---

## 3. The Agentic Workflow Pattern

To prevent **hallucinations** (incorrect hierarchy, made-up styles, broken layouts), implement a **four-agent chain of command**:

### Agent 1: Inspector (Truth Extraction)

**Goal:** Eliminate visual guessing. The AI must read DOM data, not screenshots.

```typescript
// What the Inspector extracts
{
  "type": "board",
  "name": "Card",
  "layout": { "type": "flex", "dir": "column", "gap": 16 },
  "children": [
    { "type": "text", "name": "Title", "typography": { "fontSize": "20" } },
    { "type": "text", "name": "Body", "typography": { "fontSize": "14" } }
  ]
}
```

**Implementation:**
```typescript
// Use penpotUtils in execute_code
const structure = penpotUtils.shapeStructure(penpot.selection[0], 5);
return structure;
```

### Agent 2: Architect (Semantic Mapping)

**Goal:** Map raw values to design tokens and enforce structure rules.

**Rules:**
- If you see `#4476F6`, replace with token ID `{color.primary}`
- If you see "Group", convert to "Board with Flex Layout"
- If shape matches a known component, use `instantiate_component`

```typescript
// Architect transformation example
// Before (raw Inspector data):
{ "fills": [{"color": "#FF0000"}] }

// After (semantically mapped):
{ "fills": [{"color": "{token.color.danger}"}] }
```

### Agent 3: Builder (Execution)

**Goal:** Construct designs using "Design as Code" principles.

**Rules:**
- Use Flex Layout properties (`gap`, `padding`, `alignItems`) instead of absolute X/Y
- Create containers before children
- Apply tokens, not raw hex codes

```typescript
// Builder creates with proper structure
const board = penpot.createBoard();
board.name = "Card";
board.addFlexLayout();
board.flex.dir = "column";
board.flex.rowGap = 16;
board.flex.padding = { top: 24, right: 24, bottom: 24, left: 24 };
```

### Agent 4: Auditor (Verification)

**Goal:** Self-correction loop.

```typescript
// Auditor checks
const newShape = penpotUtils.findShapeById(createdId);
const issues = [];

// Check for orphaned styles (hex codes that aren't tokens)
if (newShape.fills?.some(f => f.color?.startsWith('#'))) {
  issues.push('Orphaned style: raw hex code found');
}

// Check for missing layout
if (newShape.type === 'board' && !newShape.flex && !newShape.grid) {
  issues.push('Missing layout system on board');
}

return issues.length > 0 ? { success: false, issues } : { success: true };
```

---

## 4. Property Schema Reference

Use this unified JSON structure for all design elements:

```typescript
interface PenpotShapeSchema {
  // Identity
  id: string;                          // UUID (read-only)
  name: string;                        // Layer name
  type: "board" | "text" | "path" | "image" | "group" | "component" | "rectangle" | "ellipse";
  visible: boolean;
  locked: boolean;

  // Position & Dimensions (geometry)
  geometry: {
    x: number;
    y: number;
    width: number;                     // Read-only, use resize()
    height: number;                    // Read-only, use resize()
    rotation: number;                  // Degrees
    constraints: {
      horizontal: "min" | "max" | "center" | "scale" | "stretch";
      vertical: "min" | "max" | "center" | "scale" | "stretch";
    };
  };

  // Visual Styling
  styling: {
    opacity: number;                   // 0.0 - 1.0
    blendMode: "normal" | "multiply" | "screen" | "overlay";
    fills: Array<{
      type: "solid" | "image";
      color?: string;                  // Hex or Token ID: "{color.surface.primary}"
      opacity?: number;
      image?: string;                  // ImageID for image fills
    }>;
    strokes: Array<{
      color: string;
      width: number;
      style: "solid" | "dashed" | "dotted";
      alignment: "center" | "inner" | "outer";
    }>;
    effects: {
      shadows: Array<{
        color: string;
        x: number;
        y: number;
        blur: number;
        spread: number;
        inset: boolean;
      }>;
      blurs: Array<{
        type: "layer" | "background";
        radius: number;
      }>;
    };
    borderRadius: {
      topLeft: number;
      topRight: number;
      bottomRight: number;
      bottomLeft: number;
    };
  };

  // Flex Layout (Auto Layout)
  layout_flex?: {
    type: "flex";
    direction: "row" | "column";
    wrap: "nowrap" | "wrap";
    gap: { row: number; column: number };
    padding: { top: number; right: number; bottom: number; left: number };
    alignItems: "start" | "center" | "end" | "stretch";
    justifyContent: "start" | "center" | "end" | "space-between";
    childResizing: {
      width: "fixed" | "auto" | "fill";
      height: "fixed" | "auto" | "fill";
    };
  };

  // Grid Layout
  layout_grid?: {
    type: "grid";
    columns: string[];                 // e.g., ["1fr", "200px", "1fr"]
    rows: string[];                    // e.g., ["auto", "1fr"]
    gap: { row: number; column: number };
  };

  // Typography (Text layers only)
  typography?: {
    text: string;
    fontFamily: string;                // Or Token ID
    fontWeight: "400" | "700" | "bold";
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
    textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
    textDecoration: "none" | "underline" | "line-through";
    align: "left" | "center" | "right" | "justify";
    verticalAlign: "top" | "center" | "bottom";
  };

  // Hierarchy
  children?: PenpotShapeSchema[];
}
```

### Key Property Rules

| Property | Rule |
|----------|------|
| `width`, `height` | **Read-only**. Use `shape.resize(w, h)` to change. |
| `parentX`, `parentY` | **Read-only**. Use `penpotUtils.setParentXY(shape, x, y)`. |
| `layout_flex` | If present, child `x/y` are ignored by renderer. |
| `fills.color` | Prefer Token IDs (`{color.primary}`) over hex codes. |

---

## Building Custom Tools

### Tool Base Class

All tools extend the `Tool` base class:

```typescript
// mcp-server/src/Tool.ts
import { z } from "zod";

export abstract class Tool<TArgs extends object> {
  constructor(
    protected mcpServer: PenpotMcpServer,
    private inputSchema: z.ZodRawShape
  ) {}
  
  abstract getToolName(): string;
  abstract getToolDescription(): string;
  protected abstract executeCore(args: TArgs): Promise<ToolResponse>;
  
  // Schema is automatically generated from inputSchema
  public getInputSchema() {
    return this.inputSchema;
  }
}
```

### Creating a Tool in a Workflow

Tools should be placed in your workflow's `tools/` directory for auto-discovery.

#### File Location

```
mcp-server/src/workflows/
└── my-workflow/
    ├── workflow.yml
    └── tools/
        └── MyCustomTool.ts    # <-- Your tool here
```

### Example: Custom Flex Container Tool

Create `mcp-server/src/workflows/my-workflow/tools/CreateFlexContainerTool.ts`:

```typescript
import { z } from "zod";
import { Tool } from "../../../Tool";
import { PenpotMcpServer } from "../../../PenpotMcpServer";
import { ToolResponse, TextResponse } from "../../../ToolResponse";

export class CreateFlexContainerTool extends Tool<{
  name: string;
  direction: "row" | "column";
  gap: number;
  padding: number;
  backgroundToken?: string;
}> {
  constructor(mcpServer: PenpotMcpServer) {
    super(mcpServer, {
      name: z.string().describe("Name for the container"),
      direction: z.enum(["row", "column"]).describe("Flex direction"),
      gap: z.number().default(16).describe("Gap between children"),
      padding: z.number().default(24).describe("Padding inside container"),
      backgroundToken: z.string().optional().describe("Token ID for background fill")
    });
  }

  getToolName(): string {
    return "create_flex_container";
  }

  getToolDescription(): string {
    return "Creates a Board with Auto-Layout (Flex) enabled. " +
           "ALWAYS use this for creating UI cards, buttons, or lists.";
  }

  protected async executeCore(args: {
    name: string;
    direction: "row" | "column";
    gap: number;
    padding: number;
    backgroundToken?: string;
  }): Promise<ToolResponse> {
    const code = `
      const board = penpot.createBoard();
      board.name = ${JSON.stringify(args.name)};
      board.resize(320, 200);
      board.addFlexLayout();
      board.flex.dir = ${JSON.stringify(args.direction)};
      board.flex.rowGap = ${args.gap};
      board.flex.columnGap = ${args.gap};
      board.flex.verticalPadding = ${args.padding};
      board.flex.horizontalPadding = ${args.padding};
      ${args.backgroundToken ? `
      // Apply token-based fill
      board.fills = [{ fillColor: "${args.backgroundToken}" }];
      ` : ''}
      return { id: board.id, name: board.name };
    `;

    const result = await this.mcpServer.pluginBridge.executeCode(code);
    return new TextResponse(JSON.stringify(result, null, 2));
  }
}
```

### Register the Tool (Automatic)

**No manual registration needed!** Just add the tool class name to your workflow manifest:

```yaml
# mcp-server/src/workflows/my-workflow/workflow.yml
name: my-workflow
version: 1.0.0
description: My custom workflow
enabled: true

tools:
  - CreateFlexContainerTool  # <-- Auto-discovered and registered!
```

The WorkflowManager will automatically:
1. Discover the tool file in `tools/CreateFlexContainerTool.ts`
2. Import and instantiate it
3. Register it with the MCP server
4. Make it available to AI clients

### Manual Registration (Legacy)

<details>
<summary>If you need manual control (not recommended for new workflows)</summary>

In `mcp-server/src/PenpotMcpServer.ts`:

```typescript
import { CreateFlexContainerTool } from "./workflows/my-workflow/tools/CreateFlexContainerTool";
import { ToolRegistry } from "./registry/ToolRegistry";

// In initializeWorkflows or similar:
const registry = ToolRegistry.getInstance();
registry.register(new CreateFlexContainerTool(this));
```

</details>

---

## 6. Building Custom Resources

Resources provide read-only context to the AI. Create resources for:
- Current selection state
- Design tokens library
- Component inventory

### Example: Design Tokens Resource

```typescript
// In PenpotMcpServer.ts or a separate resource file
server.resource(
  "penpot://tokens",
  "The Design System Truth. Use these IDs, never hex codes.",
  async () => {
    const code = `
      const library = penpot.library.local;
      return {
        colors: library.colors.map(c => ({ id: c.id, name: c.name, value: c.color })),
        typographies: library.typographies.map(t => ({ id: t.id, name: t.name }))
      };
    `;
    const result = await this.pluginBridge.executeCode(code);
    return {
      contents: [{
        uri: "penpot://tokens",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);
```

### Example: Components Resource

```typescript
server.resource(
  "penpot://components",
  "Available reusable components in the library.",
  async () => {
    const code = `
      const library = penpot.library.local;
      return library.components.map(c => ({
        id: c.id,
        name: c.name,
        path: c.path
      }));
    `;
    const result = await this.pluginBridge.executeCode(code);
    return {
      contents: [{
        uri: "penpot://components",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);
```

---

## 7. System Prompts & Agent Instructions

Configure your AI client with these system instructions to enforce the agentic workflow:

### Master System Prompt

```markdown
**System Role:** You are a Penpot Design System Architect using a Full-Duplex MCP connection.

**Protocol:**

1. **INSPECT:** When asked to replicate or design, first read the `penpot://selection` resource. 
   Do not infer visual properties; extract the exact JSON structure.

2. **MAP:** Identify if the selection uses raw values. If you see `#FFFFFF`, search the 
   `penpot://tokens` resource. If you find a match (e.g., `surface.primary`), you MUST 
   use the Token ID, not the hex code.

3. **STRUCTURE:** Never use "Group." You must use the `create_flex_container` tool. 
   Follow the "Painter's Algorithm": create the container, apply layout rules (Gap/Padding), 
   then insert children.

4. **VALIDATE:** After generation, read the new object's tree. If any `layout` property 
   is `null`, delete and retry using a Flex container.

**Constraints:**
- Always read before writing
- Use semantic tools over generic `execute_code` when available
- Prefer flex layouts over absolute positioning
- Map raw values to design tokens
- Verify all operations with a follow-up read
```

### Tool-Specific Instructions

Add to tool descriptions:

```typescript
// For create_flex_container
"Creates a Board with Auto-Layout (Flex) enabled. " +
"ALWAYS use this for creating UI cards, buttons, or lists. " +
"DO NOT use execute_code to create boards manually."

// For apply_token
"Applies a Design Token to a shape. " +
"REQUIRED: First read penpot://tokens to get valid token IDs. " +
"NEVER use raw hex codes."
```

---

## 8. Working with the Penpot Plugin API

### Available Utilities (via `penpotUtils`)

The `PenpotUtils` class provides essential helper functions:

```typescript
// Get all pages
const pages = penpotUtils.getPages();  // [{ id, name }]

// Find shapes
const shape = penpotUtils.findShape(s => s.name === "MyButton");
const shapes = penpotUtils.findShapes(s => s.type === "text", penpot.root);
const byId = penpotUtils.findShapeById("uuid-here");

// Get page references
const page = penpotUtils.getPageByName("Home");

// Generate structure overview
const tree = penpotUtils.shapeStructure(shape, 3);  // maxDepth = 3

// Check containment
const isInside = penpotUtils.isContainedIn(child, parent);

// Position relative to parent
penpotUtils.setParentXY(shape, 100, 50);

// Analyze/validate descendants
const issues = penpotUtils.analyzeDescendants(board, (root, shape) => {
  if (!penpotUtils.isContainedIn(shape, root)) {
    return { issue: 'outside-bounds', shape: shape.name };
  }
  return null;
});
```

### Common Operations

```typescript
// Create a board with flex layout
const board = penpot.createBoard();
board.name = "Card";
board.resize(320, 200);
board.addFlexLayout();
board.flex.dir = "column";
board.flex.rowGap = 16;

// Create text
const text = penpot.createText("Hello World");
text.fontFamily = "Inter";
text.fontSize = "16";

// Create rectangle
const rect = penpot.createRectangle();
rect.resize(100, 50);
rect.fills = [{ fillColor: "#4476F6" }];

// Reparent shapes
board.appendChild(text);
board.appendChild(rect);

// Access selection
const selected = penpot.selection;
const firstSelected = selected[0];

// Generate CSS
const css = penpot.generateStyle([shape], { type: "css", includeChildren: true });

// Work with libraries
const library = penpot.library.local;
const component = library.components.find(c => c.name === "Button");
const instance = component.instance();
```

---

## Implementation Walkthrough

### Modern Approach: Using the Modular Workflow System

The easiest way to add custom functionality is to create a new workflow.

#### Step 1: Fork and Setup

```bash
git clone https://github.com/penpot/penpot-mcp
cd penpot-mcp
npm install
npm run bootstrap
```

#### Step 2: Create Workflow Directory

```bash
cd mcp-server/src/workflows
mkdir my-custom-workflow
cd my-custom-workflow
mkdir tools
```

#### Step 3: Create Workflow Manifest

Create `workflow.yml`:

```yaml
name: my-custom-workflow
version: 1.0.0
description: Custom workflow for my specific needs
enabled: true

tools:
  - CreateFlexContainerTool

prompts: prompts.yml

metadata:
  author: Your Name
  tags:
    - layout
    - automation
```

#### Step 4: Create Your Tool

Create `tools/CreateFlexContainerTool.ts`:

```typescript
import { z } from "zod";
import { Tool } from "../../../Tool";
import { PenpotMcpServer } from "../../../PenpotMcpServer";
import { ToolResponse, TextResponse } from "../../../ToolResponse";

export class CreateFlexContainerTool extends Tool<{
    name: string;
    direction: "row" | "column";
    gap: number;
    padding: number;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            name: z.string().describe("Name for the container"),
            direction: z.enum(["row", "column"]).describe("Flex direction"),
            gap: z.number().default(16).describe("Gap between children"),
            padding: z.number().default(24).describe("Padding inside container"),
        });
    }

    getToolName(): string {
        return "create_flex_container";
    }

    getToolDescription(): string {
        return "Creates a Board with Auto-Layout (Flex) enabled. " +
               "ALWAYS use this for creating UI cards, buttons, or lists.";
    }

    protected async executeCore(args: {
        name: string;
        direction: "row" | "column";
        gap: number;
        padding: number;
    }): Promise<ToolResponse> {
        const code = `
            const board = penpot.createBoard();
            board.name = ${JSON.stringify(args.name)};
            board.resize(320, 200);
            board.addFlexLayout();
            board.flex.dir = ${JSON.stringify(args.direction)};
            board.flex.rowGap = ${args.gap};
            board.flex.columnGap = ${args.gap};
            board.flex.verticalPadding = ${args.padding};
            board.flex.horizontalPadding = ${args.padding};
            return { id: board.id, name: board.name };
        `;

        const result = await this.mcpServer.pluginBridge.executeCode(code);
        return new TextResponse(JSON.stringify(result, null, 2));
    }
}
```

#### Step 5: Create Prompts

Create `prompts.yml`:

```yaml
workflow_instructions: |
  # Flex Container Workflow
  
  This workflow provides the `create_flex_container` tool for creating boards
  with Auto-Layout (Flex) enabled.
  
  ALWAYS use this tool instead of manually creating boards when the user
  wants to create UI components like cards, buttons, or lists.
  
  Example usage: "Create a horizontal flex container called 'Header' with 24px gap"
```

#### Step 6: Enable Workflow

Edit `mcp-server/data/workflows.yml`:

```yaml
workflows:
  my-custom-workflow:
    enabled: true
```

#### Step 7: Build and Test

```bash
npm run build:all
npm run start:all
```

Your workflow will be automatically discovered and loaded!

#### Step 8: Connect and Use

1. Load plugin in Penpot: `http://localhost:4400/manifest.json`
2. Click "Connect to MCP server"
3. Configure your AI client (Claude Desktop, Cursor, etc.)
4. Test: "Create a flex container called 'Header' with horizontal direction"

### Legacy Approach: Manual Registration

If you need more control or are maintaining legacy code:

<details>
<summary>Click to expand legacy approach</summary>

#### Step 1: Define Shared Types

In `common/src/types.ts`, add your custom task types:

```typescript
export interface CreateFlexContainerTaskParams {
  name: string;
  direction: "row" | "column";
  gap: number;
  padding: number;
  backgroundToken?: string;
}

export interface CreateFlexContainerTaskResult {
  id: string;
  name: string;
}
```

#### Step 2: Create Custom Tool

Create `mcp-server/src/tools/CreateFlexContainerTool.ts` (see Section 7).

#### Step 3: Register Tool Manually

Update `mcp-server/src/PenpotMcpServer.ts`:

```typescript
import { CreateFlexContainerTool } from "./tools/CreateFlexContainerTool";

// In registerTools():
const toolInstances = [
    // ... existing tools
    new CreateFlexContainerTool(this),
];
```

#### Step 4: Build and Test

```bash
npm run build:all
npm run start:all
```

</details>

---

## 10. Best Practices & Anti-Patterns

### ✅ DO

| Practice | Reason |
|----------|--------|
| Read before writing | Prevents hallucinations |
| Use flex layouts | Maintains responsive structure |
| Map values to tokens | Ensures design consistency |
| Create semantic tools | Enforces proper structure |
| Validate after changes | Catches errors early |
| Store intermediate results in `storage` | Build on previous work |

### ❌ DON'T

| Anti-Pattern | Problem |
|--------------|---------|
| Generic `create_rect` tools | No structure enforcement |
| Raw hex codes in fills | Breaks design system |
| Absolute X/Y positioning | Layouts break on resize |
| Groups instead of Boards | No layout capabilities |
| Guessing from screenshots | Hallucinated properties |
| Skipping the Auditor step | Unverified changes |

### Code Quality Guidelines

```typescript
// ❌ Bad: Generic, no structure
const rect = penpot.createRectangle();
rect.x = 100;
rect.y = 200;
rect.fills = [{ fillColor: "#FF0000" }];

// ✅ Good: Semantic, structured, token-based
const card = penpot.createBoard();
card.name = "Card";
card.addFlexLayout();
card.flex.dir = "column";
card.flex.rowGap = 16;
card.flex.padding = 24;
card.fills = [{ fillColor: "{color.surface.card}" }];
```

---

## 11. Troubleshooting

### Connection Issues

| Issue | Solution |
|-------|----------|
| Plugin won't connect | Check browser PNA restrictions (use Firefox or disable shields) |
| WebSocket disconnects | Keep plugin window open in Penpot |
| "No transport found" | Ensure MCP server is running on port 4401 |

### Design Issues

| Issue | Solution |
|-------|----------|
| Layouts break | Ensure using flex/grid instead of absolute positioning |
| Wrong colors | Check token mapping, verify against `penpot://tokens` |
| Missing children | Verify parent-child relationships with `shapeStructure()` |
| Shapes outside bounds | Use `isContainedIn()` to validate containment |

### Debugging Tips

```typescript
// Enable verbose logging in execute_code
const debug = true;
if (debug) {
  console.log("Current selection:", penpot.selection);
  console.log("Shape structure:", penpotUtils.shapeStructure(shape, 2));
}

// Store results for inspection
storage.lastResult = result;
storage.lastError = error;
```

### Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Firefox | ✅ Best | No PNA restrictions |
| Chrome | ⚠️ | Approve network access popup |
| Brave | ⚠️ | Disable Shield for Penpot site |
| Edge | ⚠️ | Similar to Chrome |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW CHEATSHEET                       │
├─────────────────────────────────────────────────────────────┤
│ 1. INSPECT  → penpotUtils.shapeStructure(selection, 3)      │
│ 2. MAP      → Replace #hex with {token.id}                  │
│ 3. BUILD    → createBoard() + addFlexLayout() + children    │
│ 4. AUDIT    → Verify layout !== null, tokens applied        │
├─────────────────────────────────────────────────────────────┤
│ KEY UTILITIES                                                │
│ • findShape(predicate)     → First matching shape           │
│ • findShapes(predicate)    → All matching shapes            │
│ • shapeStructure(shape, n) → JSON tree (n levels deep)      │
│ • setParentXY(shape, x, y) → Position relative to parent    │
│ • isContainedIn(child, p)  → Check visual containment       │
├─────────────────────────────────────────────────────────────┤
│ LAYOUT RULES                                                 │
│ • Flex dir: row | column                                     │
│ • Gap: rowGap, columnGap                                     │
│ • Padding: top, right, bottom, left                          │
│ • Align: start | center | end | stretch                      │
├─────────────────────────────────────────────────────────────┤
│ PORTS                                                        │
│ • MCP HTTP/SSE: 4401                                         │
│ • WebSocket:    4402                                         │
│ • REPL:         4403                                         │
│ • Plugin:       4400                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Further Reading

- [Building a Full-Duplex Penpot MCP Server Architecture](./Building%20a%20Full-Duplex%20Penpot%20MCP%20Server%20Architecture.md)
- [Building Hallucination-Free Penpot MCP Servers](./Building%20Hallucination-Free%20Penpot%20MCP%20Servers%20with%20Full-Duplex%20Architecture.md)
- [Penpot AI Property Schema and Implementation Guide](./Penpot%20AI%20Property%20Schema%20and%20Implementation%20Guide.md)
- [Local Development Guide](../local-development.md)
- [Multi-User Mode](../multi-user-mode.md)
