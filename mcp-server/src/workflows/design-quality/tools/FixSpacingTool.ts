import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Detects and optionally fixes inconsistent spacing in flex/grid layouts.
 * Enforces the standard spacing scale from the best practices guide.
 */
export class FixSpacingTool extends Tool<{
    target: string;
    spacingScale?: number[];
    autoFix?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to check spacing: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
            spacingScale: z.array(z.number()).optional().describe(
                'Custom spacing scale to use. Default: [4, 8, 12, 16, 24, 32] (xs, sm, md, lg, xl, xxl)'
            ),
            autoFix: z.boolean().default(false).describe(
                'If true, automatically snap gaps to nearest spacing scale value. Default: false (detection only)'
            ),
        });
    }

    getToolName(): string {
        return "fix_spacing";
    }

    getToolDescription(): string {
        return (
            "Detects inconsistent spacing in flex/grid layouts and optionally fixes them by snapping " +
            "to the nearest spacing scale value. Use autoFix=true to apply corrections automatically. " +
            "Enforces the standard spacing scale: xs=4, sm=8, md=12, lg=16, xl=24, xxl=32."
        );
    }

    protected async executeCore(args: {
        target: string;
        spacingScale?: number[];
        autoFix?: boolean;
    }): Promise<ToolResponse> {
        const spacingScale = args.spacingScale || [4, 8, 12, 16, 24, 32];
        const autoFix = args.autoFix || false;

        const code = `
            // Get target shape
            let targetShape;
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a shape or use 'page' as target." };
                }
                targetShape = penpot.selection[0];
            } else if (${JSON.stringify(args.target)} === "page") {
                targetShape = penpot.root;
            } else {
                targetShape = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!targetShape) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
            }

            const spacingScale = ${JSON.stringify(spacingScale)};
            const autoFix = ${autoFix};

            // Helper to find nearest spacing value
            const findNearestSpacing = (value) => {
                return spacingScale.reduce((prev, curr) => 
                    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
                );
            };

            // Find all flex and grid containers
            const flexContainers = penpotUtils.findShapes(shape => 
                shape.type === 'board' && shape.flex,
                targetShape
            );

            const gridContainers = penpotUtils.findShapes(shape => 
                shape.type === 'board' && shape.grid,
                targetShape
            );

            const spacingIssues = [];
            let fixedCount = 0;

            // Check flex containers
            flexContainers.forEach(board => {
                const issues = [];
                
                // Check rowGap
                if (board.flex.rowGap !== undefined && board.flex.rowGap > 0) {
                    if (!spacingScale.includes(board.flex.rowGap)) {
                        const nearest = findNearestSpacing(board.flex.rowGap);
                        const issue = {
                            property: 'rowGap',
                            current: board.flex.rowGap,
                            suggested: nearest,
                            difference: Math.abs(board.flex.rowGap - nearest)
                        };
                        issues.push(issue);
                        
                        if (autoFix) {
                            board.flex.rowGap = nearest;
                            issue.fixed = true;
                            fixedCount++;
                        }
                    }
                }
                
                // Check columnGap
                if (board.flex.columnGap !== undefined && board.flex.columnGap > 0) {
                    if (!spacingScale.includes(board.flex.columnGap)) {
                        const nearest = findNearestSpacing(board.flex.columnGap);
                        const issue = {
                            property: 'columnGap',
                            current: board.flex.columnGap,
                            suggested: nearest,
                            difference: Math.abs(board.flex.columnGap - nearest)
                        };
                        issues.push(issue);
                        
                        if (autoFix) {
                            board.flex.columnGap = nearest;
                            issue.fixed = true;
                            fixedCount++;
                        }
                    }
                }

                // Check padding values
                const paddingProps = ['topPadding', 'rightPadding', 'bottomPadding', 'leftPadding'];
                paddingProps.forEach(prop => {
                    if (board.flex[prop] !== undefined && board.flex[prop] > 0) {
                        if (!spacingScale.includes(board.flex[prop])) {
                            const nearest = findNearestSpacing(board.flex[prop]);
                            const issue = {
                                property: prop,
                                current: board.flex[prop],
                                suggested: nearest,
                                difference: Math.abs(board.flex[prop] - nearest)
                            };
                            issues.push(issue);
                            
                            if (autoFix) {
                                board.flex[prop] = nearest;
                                issue.fixed = true;
                                fixedCount++;
                            }
                        }
                    }
                });
                
                if (issues.length > 0) {
                    spacingIssues.push({
                        type: 'flex',
                        container: {
                            id: board.id,
                            name: board.name,
                            direction: board.flex.dir
                        },
                        issues
                    });
                }
            });

            // Check grid containers
            gridContainers.forEach(board => {
                const issues = [];
                
                // Check rowGap
                if (board.grid.rowGap !== undefined && board.grid.rowGap > 0) {
                    if (!spacingScale.includes(board.grid.rowGap)) {
                        const nearest = findNearestSpacing(board.grid.rowGap);
                        const issue = {
                            property: 'rowGap',
                            current: board.grid.rowGap,
                            suggested: nearest,
                            difference: Math.abs(board.grid.rowGap - nearest)
                        };
                        issues.push(issue);
                        
                        if (autoFix) {
                            board.grid.rowGap = nearest;
                            issue.fixed = true;
                            fixedCount++;
                        }
                    }
                }
                
                // Check columnGap
                if (board.grid.columnGap !== undefined && board.grid.columnGap > 0) {
                    if (!spacingScale.includes(board.grid.columnGap)) {
                        const nearest = findNearestSpacing(board.grid.columnGap);
                        const issue = {
                            property: 'columnGap',
                            current: board.grid.columnGap,
                            suggested: nearest,
                            difference: Math.abs(board.grid.columnGap - nearest)
                        };
                        issues.push(issue);
                        
                        if (autoFix) {
                            board.grid.columnGap = nearest;
                            issue.fixed = true;
                            fixedCount++;
                        }
                    }
                }
                
                if (issues.length > 0) {
                    spacingIssues.push({
                        type: 'grid',
                        container: {
                            id: board.id,
                            name: board.name,
                            rows: board.grid.rows?.length || 0,
                            columns: board.grid.columns?.length || 0
                        },
                        issues
                    });
                }
            });

            // Generate spacing scale reference
            const scaleReference = {
                xs: spacingScale[0] || 4,
                sm: spacingScale[1] || 8,
                md: spacingScale[2] || 12,
                lg: spacingScale[3] || 16,
                xl: spacingScale[4] || 24,
                xxl: spacingScale[5] || 32
            };

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                spacingScale: scaleReference,
                totalContainersChecked: flexContainers.length + gridContainers.length,
                containersWithIssues: spacingIssues.length,
                totalIssues: spacingIssues.reduce((sum, c) => sum + c.issues.length, 0),
                fixedCount,
                autoFixEnabled: autoFix,
                issues: spacingIssues
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Spacing check failed: ${result.error}`);
        }

        // Format the results
        let output = `# Spacing Validation Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Containers Checked:** ${result.totalContainersChecked}\n`;
        output += `**Containers with Issues:** ${result.containersWithIssues}\n`;
        output += `**Total Issues:** ${result.totalIssues}\n`;
        
        if (result.autoFixEnabled) {
            output += `**Auto-Fix:** ENABLED - Fixed ${result.fixedCount} spacing values\n`;
        } else {
            output += `**Auto-Fix:** DISABLED (detection only)\n`;
        }
        output += `\n`;

        // Show spacing scale reference
        output += `## Standard Spacing Scale\n\n`;
        output += `| Name | Value | Use Case |\n`;
        output += `|------|-------|----------|\n`;
        output += `| xs   | ${result.spacingScale.xs}px  | Tight spacing (within components) |\n`;
        output += `| sm   | ${result.spacingScale.sm}px  | Small spacing (related elements) |\n`;
        output += `| md   | ${result.spacingScale.md}px | Medium spacing (component internal) |\n`;
        output += `| lg   | ${result.spacingScale.lg}px | Large spacing (between components) |\n`;
        output += `| xl   | ${result.spacingScale.xl}px | Extra large (section spacing) |\n`;
        output += `| xxl  | ${result.spacingScale.xxl}px | Maximum (major sections) |\n\n`;

        if (result.totalIssues === 0) {
            output += `✅ **All spacing values conform to the standard scale!**\n`;
        } else {
            output += `## Issues Found\n\n`;
            
            result.issues.forEach((container: any) => {
                output += `### ${container.container.name} (${container.type})\n`;
                if (container.type === 'flex') {
                    output += `- Direction: ${container.container.direction}\n`;
                } else {
                    output += `- Grid: ${container.container.rows}x${container.container.columns}\n`;
                }
                output += `- ID: \`${container.container.id}\`\n`;
                output += `- Issues: ${container.issues.length}\n\n`;
                
                container.issues.forEach((issue: any) => {
                    const status = issue.fixed ? '✅ FIXED' : '⚠️';
                    output += `  ${status} **${issue.property}**: ${issue.current}px → ${issue.suggested}px (diff: ${issue.difference}px)\n`;
                });
                output += `\n`;
            });

            if (!result.autoFixEnabled) {
                output += `\n💡 **Tip:** Run again with \`autoFix: true\` to automatically apply these corrections.\n`;
            }
        }

        return new TextResponse(output);
    }
}
