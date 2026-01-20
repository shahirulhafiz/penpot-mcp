import { EmptyToolArgs, Tool } from "../../../Tool.js";
import "reflect-metadata";
import type { ToolResponse } from "../../../ToolResponse.js";
import { TextResponse } from "../../../ToolResponse.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";

export class HighLevelOverviewTool extends Tool<EmptyToolArgs> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, EmptyToolArgs.schema);
    }

    public getToolName(): string {
        return "high_level_overview";
    }

    public getToolDescription(): string {
        return (
            "Returns basic high-level instructions on the usage of Penpot-related tools and the Penpot API. " +
            "If you have already read the 'Penpot High-Level Overview', you must not call this tool."
        );
    }

    protected async executeCore(args: EmptyToolArgs): Promise<ToolResponse> {
        return new TextResponse(this.mcpServer.getInitialInstructions());
    }
}
