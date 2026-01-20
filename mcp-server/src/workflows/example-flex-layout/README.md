# Example Flex Layout Workflow

This is an **example workflow** demonstrating how to create custom modular workflows for the Penpot MCP Server.

## Purpose

This workflow serves as a **reference implementation** showing:

- How to structure a workflow directory
- How to create custom tools
- How to write workflow-specific prompts
- How to package everything into a discoverable workflow

## What It Does

Provides a `create_flex_container` tool that:
- Creates boards with Auto-Layout (Flex) enabled
- Configures flex direction (row/column)
- Sets gaps and padding
- Saves time vs manual board creation

## Enabling This Workflow

### Option 1: Configuration File

Edit `mcp-server/data/workflows.yml`:

```yaml
workflows:
  example-flex-layout:
    enabled: true
```

### Option 2: Environment Variable

```bash
export PENPOT_MCP_WORKFLOW_EXAMPLE_FLEX_LAYOUT=true
npm run start:all
```

## Using the Tool

Once enabled, AI agents can use the tool:

**User:** "Create a horizontal flex container called 'Navbar' with 20px gap"

**AI Response:** Uses `create_flex_container` with:
- name: "Navbar"
- direction: "row"
- gap: 20
- padding: 24 (default)

## File Structure

```
example-flex-layout/
├── workflow.yml              # Workflow manifest
├── prompts.yml               # AI instructions
├── tools/
│   └── CreateFlexContainerTool.ts  # The tool implementation
└── README.md                 # This file
```

## Creating Your Own Workflow

Use this as a template:

1. **Copy this directory:**
   ```bash
   cp -r example-flex-layout my-workflow
   ```

2. **Update `workflow.yml`:**
   ```yaml
   name: my-workflow
   description: What my workflow does
   ```

3. **Modify the tool in `tools/`:**
   - Rename the file
   - Update class name
   - Implement your logic

4. **Update `prompts.yml`:**
   - Add instructions for AI agents
   - Provide usage examples

5. **Enable and test:**
   ```bash
   npm run build:all
   npm run start:all
   ```

## Key Concepts Demonstrated

### 1. Tool Base Class

All tools extend `Tool<TArgs>`:

```typescript
export class MyTool extends Tool<{ arg1: string }> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            arg1: z.string().describe("Description"),
        });
    }
    
    getToolName(): string { return "my_tool"; }
    getToolDescription(): string { return "Description"; }
    
    protected async executeCore(args: { arg1: string }): Promise<ToolResponse> {
        // Your logic here
    }
}
```

### 2. Plugin Bridge

Execute code in the Penpot plugin:

```typescript
const code = `
    const board = penpot.createBoard();
    return { id: board.id };
`;
const result = await this.mcpServer.pluginBridge.executeCode(code);
```

### 3. Auto-Discovery

No manual registration needed! Just:
- Place tool in `tools/` directory
- List class name in workflow.yml
- Build and run

### 4. Workflow Isolation

Each workflow is self-contained:
- Own tools
- Own prompts
- Own configuration
- Can be enabled/disabled independently

## Best Practices

1. **Single Responsibility:** Each workflow focuses on one domain
2. **Clear Tool Names:** Use descriptive, action-oriented names
3. **Good Descriptions:** Help AI understand when to use the tool
4. **Comprehensive Prompts:** Provide examples and best practices
5. **Error Handling:** Handle edge cases gracefully
6. **Type Safety:** Use Zod schemas for validation

## Next Steps

- Read the [Creating Custom Workflows Guide](../../../../docs/workflows/Creating-Custom-Workflows-Guide.md)
- Explore the `core` workflow for more examples
- Create your own workflow based on your needs
- Share your workflows as npm packages

## Questions?

See the main [workflows README](../README.md) for more information.
