import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Applies a consistent spacing scale to a layout container.
 * Provides presets (compact, default, spacious) or custom spacing values.
 */
export class ApplySpacingScaleTool extends Tool<{
    target: string;
    preset?: string;
    gap?: number;
    padding?: number;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target container shape ID or "selection" for current selection'
            ),
            preset: z.enum(["compact", "default", "spacious"]).optional().describe(
                'Spacing preset: "compact" (tight), "default" (standard), or "spacious" (generous). ' +
                'If not specified, uses individual gap/padding values.'
            ),
            gap: z.number().optional().describe(
                'Custom gap value in pixels. Used when preset is not specified.'
            ),
            padding: z.number().optional().describe(
                'Custom padding value in pixels. Used when preset is not specified.'
            ),
        });
    }

    getToolName(): string {
        return "apply_spacing_scale";
    }

    getToolDescription(): string {
        return (
            "Applies consistent spacing values to a flex or grid layout container. " +
            "Use presets (compact/default/spacious) for quick standardization, or specify custom gap/padding values. " +
            "Compact: 8px gap, 16px padding. Default: 16px gap, 24px padding. Spacious: 24px gap, 32px padding."
        );
    }

    protected async executeCore(args: {
        target: string;
        preset?: string;
        gap?: number;
        padding?: number;
    }): Promise<ToolResponse> {
        // Determine spacing values
        let gap: number;
        let padding: number;
        let presetUsed: string | null = null;

        if (args.preset) {
            presetUsed = args.preset;
            switch (args.preset) {
                case "compact":
                    gap = 8;
                    padding = 16;
                    break;
                case "default":
                    gap = 16;
                    padding = 24;
                    break;
                case "spacious":
                    gap = 24;
                    padding = 32;
                    break;
                default:
                    return new TextResponse(`❌ Invalid preset: ${args.preset}`);
            }
        } else if (args.gap !== undefined || args.padding !== undefined) {
            gap = args.gap !== undefined ? args.gap : 16;
            padding = args.padding !== undefined ? args.padding : 24;
        } else {
            return new TextResponse(
                `❌ Either specify a preset (compact/default/spacious) or provide gap/padding values.`
            );
        }

        const code = `
            // Get target shape
            let targetShape;
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a container shape." };
                }
                targetShape = penpot.selection[0];
            } else {
                targetShape = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!targetShape) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
            }

            const gap = ${gap};
            const padding = ${padding};
            const preset = ${JSON.stringify(presetUsed)};

            // Check if target is a board with layout
            if (targetShape.type !== 'board') {
                return {
                    error: "Target must be a board with flex or grid layout. Selected shape type: " + targetShape.type
                };
            }

            const before = {
                name: targetShape.name,
                type: targetShape.type,
                hasFlex: !!targetShape.flex,
                hasGrid: !!targetShape.grid
            };

            // Apply to flex layout
            if (targetShape.flex) {
                before.flex = {
                    rowGap: targetShape.flex.rowGap,
                    columnGap: targetShape.flex.columnGap,
                    topPadding: targetShape.flex.topPadding,
                    rightPadding: targetShape.flex.rightPadding,
                    bottomPadding: targetShape.flex.bottomPadding,
                    leftPadding: targetShape.flex.leftPadding
                };

                targetShape.flex.rowGap = gap;
                targetShape.flex.columnGap = gap;
                targetShape.flex.topPadding = padding;
                targetShape.flex.rightPadding = padding;
                targetShape.flex.bottomPadding = padding;
                targetShape.flex.leftPadding = padding;

                return {
                    success: true,
                    layoutType: 'flex',
                    preset,
                    applied: {
                        gap,
                        padding
                    },
                    before,
                    after: {
                        flex: {
                            rowGap: targetShape.flex.rowGap,
                            columnGap: targetShape.flex.columnGap,
                            topPadding: targetShape.flex.topPadding,
                            rightPadding: targetShape.flex.rightPadding,
                            bottomPadding: targetShape.flex.bottomPadding,
                            leftPadding: targetShape.flex.leftPadding
                        }
                    },
                    shape: {
                        id: targetShape.id,
                        name: targetShape.name
                    }
                };
            }
            
            // Apply to grid layout
            if (targetShape.grid) {
                before.grid = {
                    rowGap: targetShape.grid.rowGap,
                    columnGap: targetShape.grid.columnGap
                };

                targetShape.grid.rowGap = gap;
                targetShape.grid.columnGap = gap;

                return {
                    success: true,
                    layoutType: 'grid',
                    preset,
                    applied: {
                        gap,
                        padding
                    },
                    before,
                    after: {
                        grid: {
                            rowGap: targetShape.grid.rowGap,
                            columnGap: targetShape.grid.columnGap
                        }
                    },
                    shape: {
                        id: targetShape.id,
                        name: targetShape.name
                    },
                    note: "Grid layouts only support gap values, not padding."
                };
            }

            return {
                error: "Target board has no flex or grid layout. Add a layout system first using board.addFlexLayout() or board.addGridLayout()."
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Spacing application failed: ${result.error}`);
        }

        if (!result?.success) {
            return new TextResponse(`❌ Failed to apply spacing scale.`);
        }

        // Format the results
        let output = `# Spacing Scale Applied\n\n`;
        output += `**Container:** ${result.shape.name}\n`;
        output += `**Layout Type:** ${result.layoutType}\n`;
        
        if (result.preset) {
            output += `**Preset Used:** ${result.preset}\n`;
        }
        
        output += `\n## Applied Values\n\n`;
        output += `- **Gap:** ${result.applied.gap}px\n`;
        if (result.layoutType === 'flex') {
            output += `- **Padding:** ${result.applied.padding}px (all sides)\n`;
        }
        
        output += `\n## Before vs After\n\n`;
        
        if (result.layoutType === 'flex') {
            output += `| Property | Before | After |\n`;
            output += `|----------|--------|-------|\n`;
            output += `| Row Gap | ${result.before.flex.rowGap}px | ${result.after.flex.rowGap}px |\n`;
            output += `| Column Gap | ${result.before.flex.columnGap}px | ${result.after.flex.columnGap}px |\n`;
            output += `| Top Padding | ${result.before.flex.topPadding}px | ${result.after.flex.topPadding}px |\n`;
            output += `| Right Padding | ${result.before.flex.rightPadding}px | ${result.after.flex.rightPadding}px |\n`;
            output += `| Bottom Padding | ${result.before.flex.bottomPadding}px | ${result.after.flex.bottomPadding}px |\n`;
            output += `| Left Padding | ${result.before.flex.leftPadding}px | ${result.after.flex.leftPadding}px |\n`;
        } else if (result.layoutType === 'grid') {
            output += `| Property | Before | After |\n`;
            output += `|----------|--------|-------|\n`;
            output += `| Row Gap | ${result.before.grid.rowGap}px | ${result.after.grid.rowGap}px |\n`;
            output += `| Column Gap | ${result.before.grid.columnGap}px | ${result.after.grid.columnGap}px |\n`;
            
            if (result.note) {
                output += `\n📝 **Note:** ${result.note}\n`;
            }
        }

        output += `\n✅ **Spacing scale successfully applied!**\n`;

        // Add preset reference
        output += `\n## Available Presets\n\n`;
        output += `| Preset | Gap | Padding | Use Case |\n`;
        output += `|--------|-----|---------|----------|\n`;
        output += `| compact | 8px | 16px | Tight, dense interfaces |\n`;
        output += `| default | 16px | 24px | Standard UI components |\n`;
        output += `| spacious | 24px | 32px | Generous, airy layouts |\n`;

        return new TextResponse(output);
    }
}
