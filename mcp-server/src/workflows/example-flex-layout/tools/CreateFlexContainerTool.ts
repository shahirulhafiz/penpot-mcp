import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Tool for creating boards with Auto-Layout (Flex) enabled.
 *
 * This is an example tool demonstrating how to create custom workflows.
 * It creates a board with flex layout configured according to user specifications.
 */
export class CreateFlexContainerTool extends Tool<{
    name: string;
    direction: "row" | "column";
    gap: number;
    padding: number;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            name: z.string().describe("Name for the container board"),
            direction: z.enum(["row", "column"]).describe("Flex direction: 'row' for horizontal, 'column' for vertical"),
            gap: z.number().default(16).describe("Gap between children in pixels (default: 16)"),
            padding: z.number().default(24).describe("Padding inside the container in pixels (default: 24)"),
        });
    }

    getToolName(): string {
        return "create_flex_container";
    }

    getToolDescription(): string {
        return (
            "Creates a Board with Auto-Layout (Flex) enabled. " +
            "ALWAYS use this tool for creating UI cards, buttons, lists, or any container that should automatically adjust to its content. " +
            "This tool is part of the example-flex-layout workflow and demonstrates how custom workflows work."
        );
    }

    protected async executeCore(args: {
        name: string;
        direction: "row" | "column";
        gap: number;
        padding: number;
    }): Promise<ToolResponse> {
        // Generate code to execute in the Penpot plugin
        const code = `
            // Create a new board
            const board = penpot.createBoard();
            board.name = ${JSON.stringify(args.name)};
            
            // Set initial size (will adjust with flex layout)
            board.resize(320, 200);
            
            // Add flex layout
            board.addFlexLayout();
            board.flex.dir = ${JSON.stringify(args.direction)};
            
            // Configure spacing
            board.flex.rowGap = ${args.gap};
            board.flex.columnGap = ${args.gap};
            
            // Configure padding
            board.flex.verticalPadding = ${args.padding};
            board.flex.horizontalPadding = ${args.padding};
            
            // Set default flex properties for children
            board.flex.alignItems = "start";
            board.flex.justifyContent = "start";
            
            // Return info about created board
            return {
                success: true,
                id: board.id,
                name: board.name,
                type: board.type,
                flex: {
                    direction: board.flex.dir,
                    gap: ${args.gap},
                    padding: ${args.padding}
                }
            };
        `;

        // Execute the code via the plugin bridge
        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        // Return formatted response
        return new TextResponse(
            `✅ Created flex container:\n\n` +
            `${JSON.stringify(result, null, 2)}\n\n` +
            `The board "${args.name}" is ready for content. ` +
            `Add child elements and they will automatically be laid out according to the flex settings.`
        );
    }
}
