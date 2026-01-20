import { Tool } from "../Tool";
import { createLogger } from "../logger";
import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

/**
 * Central registry for managing MCP tools.
 *
 * Provides singleton pattern for global tool registration and discovery.
 * Supports both manual registration and auto-discovery from filesystem.
 */
export class ToolRegistry {
    private static instance: ToolRegistry;
    private readonly logger = createLogger("ToolRegistry");
    private readonly tools: Map<string, Tool<any>> = new Map();

    private constructor() {}

    /**
     * Gets the singleton instance of the ToolRegistry.
     */
    public static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    /**
     * Registers a single tool.
     *
     * @param tool - The tool instance to register
     * @throws Error if a tool with the same name is already registered
     */
    public register(tool: Tool<any>): void {
        const toolName = tool.getToolName();

        if (this.tools.has(toolName)) {
            throw new Error(`Tool '${toolName}' is already registered`);
        }

        this.tools.set(toolName, tool);
        this.logger.info(`Registered tool: ${toolName}`);
    }

    /**
     * Registers multiple tools in batch.
     *
     * @param tools - Array of tool instances to register
     */
    public registerAll(tools: Tool<any>[]): void {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    /**
     * Gets all registered tools.
     *
     * @returns Array of all registered tool instances
     */
    public getTools(): Tool<any>[] {
        return Array.from(this.tools.values());
    }

    /**
     * Finds a tool by name.
     *
     * @param name - The tool name to search for
     * @returns The tool instance, or undefined if not found
     */
    public getToolByName(name: string): Tool<any> | undefined {
        return this.tools.get(name);
    }

    /**
     * Checks if a tool is registered.
     *
     * @param name - The tool name to check
     * @returns True if the tool is registered
     */
    public hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Auto-discovers and registers tools from a directory.
     *
     * Scans the directory for files matching the pattern *Tool.ts and attempts
     * to import and instantiate tool classes.
     *
     * @param directory - The directory path to scan for tools
     * @param mcpServer - The MCP server instance to pass to tool constructors
     * @returns Array of discovered and registered tools
     */
    public async discoverTools(directory: string, mcpServer: any): Promise<Tool<any>[]> {
        const discoveredTools: Tool<any>[] = [];

        try {
            const entries = await readdir(directory, { withFileTypes: true });

            for (const entry of entries) {
                // Look for *Tool.ts or *Tool.js files
                if (entry.isFile() && /Tool\.(ts|js)$/.test(entry.name)) {
                    const toolPath = join(directory, entry.name);
                    
                    try {
                        // Dynamic import of the tool module
                        // Use file:// URL for cross-platform compatibility (required on Windows)
                        const toolModule = await import(pathToFileURL(toolPath).href);

                        // Look for exported classes
                        for (const exportName of Object.keys(toolModule)) {
                            const ExportedClass = toolModule[exportName];

                            // Check if it's a class that extends Tool
                            if (typeof ExportedClass === "function" && ExportedClass.prototype) {
                                try {
                                    const toolInstance = new ExportedClass(mcpServer);

                                    // Verify it's actually a Tool by checking for required methods
                                    if (
                                        typeof toolInstance.getToolName === "function" &&
                                        typeof toolInstance.getToolDescription === "function" &&
                                        typeof toolInstance.execute === "function"
                                    ) {
                                        this.register(toolInstance);
                                        discoveredTools.push(toolInstance);
                                        this.logger.info(`Auto-discovered tool: ${entry.name} -> ${toolInstance.getToolName()}`);
                                    }
                                } catch (error) {
                                    // Ignore classes that can't be instantiated
                                    this.logger.debug(`Could not instantiate ${exportName} from ${entry.name}: ${error}`);
                                }
                            }
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to load tool from ${entry.name}: ${error}`);
                    }
                }
            }

            this.logger.info(`Discovered ${discoveredTools.length} tools from ${directory}`);
        } catch (error) {
            this.logger.error(`Failed to discover tools in directory ${directory}: ${error}`);
        }

        return discoveredTools;
    }

    /**
     * Clears all registered tools.
     *
     * Useful for testing or reloading workflows.
     */
    public clear(): void {
        const count = this.tools.size;
        this.tools.clear();
        this.logger.info(`Cleared ${count} tools from registry`);
    }

    /**
     * Gets the number of registered tools.
     */
    public size(): number {
        return this.tools.size;
    }
}
