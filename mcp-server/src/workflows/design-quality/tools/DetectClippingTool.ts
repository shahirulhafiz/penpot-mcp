import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Detects content clipping issues where elements extend beyond their parent bounds.
 * This is the most common design issue according to the best practices guide.
 */
export class DetectClippingTool extends Tool<{
    target: string;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to check for clipping: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
        });
    }

    getToolName(): string {
        return "detect_clipping";
    }

    getToolDescription(): string {
        return (
            "Detects content clipping issues where child elements extend beyond their parent's bounds. " +
            "This is the most common design problem. Returns detailed information about overflow " +
            "with suggestions for fixing."
        );
    }

    protected async executeCore(args: {
        target: string;
    }): Promise<ToolResponse> {
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

            // Find all clipping issues
            const clippingIssues = penpotUtils.analyzeDescendants(targetShape, (root, shape) => {
                if (!shape.parent) {
                    return null;
                }

                // Check if shape is contained within parent
                if (!penpotUtils.isContainedIn(shape, shape.parent)) {
                    // Calculate overflow amounts
                    const overflow = {
                        left: Math.max(0, shape.parent.x - shape.x),
                        top: Math.max(0, shape.parent.y - shape.y),
                        right: Math.max(0, (shape.x + shape.width) - (shape.parent.x + shape.parent.width)),
                        bottom: Math.max(0, (shape.y + shape.height) - (shape.parent.y + shape.parent.height))
                    };

                    // Calculate total overflow
                    const totalOverflow = overflow.left + overflow.top + overflow.right + overflow.bottom;

                    // Determine severity
                    let severity = "minor";
                    if (totalOverflow > 50) {
                        severity = "critical";
                    } else if (totalOverflow > 20) {
                        severity = "major";
                    } else if (totalOverflow > 10) {
                        severity = "moderate";
                    }

                    return {
                        shape: {
                            id: shape.id,
                            name: shape.name,
                            type: shape.type,
                            bounds: {
                                x: Math.round(shape.x),
                                y: Math.round(shape.y),
                                width: Math.round(shape.width),
                                height: Math.round(shape.height)
                            }
                        },
                        parent: {
                            id: shape.parent.id,
                            name: shape.parent.name,
                            type: shape.parent.type,
                            bounds: {
                                x: Math.round(shape.parent.x),
                                y: Math.round(shape.parent.y),
                                width: Math.round(shape.parent.width),
                                height: Math.round(shape.parent.height)
                            }
                        },
                        overflow: {
                            left: Math.round(overflow.left),
                            top: Math.round(overflow.top),
                            right: Math.round(overflow.right),
                            bottom: Math.round(overflow.bottom),
                            total: Math.round(totalOverflow)
                        },
                        severity
                    };
                }
                return null;
            });

            // Sort by severity
            const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3 };
            clippingIssues.sort((a, b) => 
                severityOrder[a.result.severity] - severityOrder[b.result.severity]
            );

            // Generate suggestions
            const suggestions = [];
            if (clippingIssues.length > 0) {
                suggestions.push("Common solutions for clipping issues:");
                suggestions.push("1. Increase parent container size to accommodate content");
                suggestions.push("2. Reposition child elements within parent bounds");
                suggestions.push("3. Apply flex layout for automatic content handling");
                suggestions.push("4. Reduce child element size if appropriate");
                
                // Check if any parents lack layout systems
                const parentsWithoutLayout = [...new Set(
                    clippingIssues
                        .filter(c => c.result.parent.type === 'board')
                        .map(c => c.result.parent.id)
                )];
                
                if (parentsWithoutLayout.length > 0) {
                    const boardsWithoutFlex = parentsWithoutLayout.filter(id => {
                        const board = penpotUtils.findShapeById(id);
                        return board && !board.flex && !board.grid;
                    });
                    
                    if (boardsWithoutFlex.length > 0) {
                        suggestions.push("");
                        suggestions.push("⚠️ Note: Some parent boards don't have flex/grid layout enabled.");
                        suggestions.push("   Consider using flex layout to prevent clipping issues.");
                    }
                }
            }

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                totalIssues: clippingIssues.length,
                issues: clippingIssues.map(c => c.result),
                suggestions
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Clipping detection failed: ${result.error}`);
        }

        // Format the results
        let output = `# Content Clipping Detection Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Issues Found:** ${result.totalIssues}\n\n`;

        if (result.totalIssues === 0) {
            output += `✅ **No clipping issues detected!** All elements are properly contained within their parents.\n`;
        } else {
            output += `⚠️ Found ${result.totalIssues} element(s) extending beyond parent bounds:\n\n`;
            
            // Group by severity
            const bySeverity = {
                critical: result.issues.filter((i: any) => i.severity === 'critical'),
                major: result.issues.filter((i: any) => i.severity === 'major'),
                moderate: result.issues.filter((i: any) => i.severity === 'moderate'),
                minor: result.issues.filter((i: any) => i.severity === 'minor')
            };

            Object.entries(bySeverity).forEach(([severity, issues]) => {
                if (issues.length > 0) {
                    output += `## ${severity.toUpperCase()} (${issues.length})\n\n`;
                    issues.forEach((issue: any) => {
                        output += `### ${issue.shape.name} (${issue.shape.type})\n`;
                        output += `- **Parent:** ${issue.parent.name}\n`;
                        output += `- **Overflow:**\n`;
                        if (issue.overflow.left > 0) output += `  - Left: ${issue.overflow.left}px\n`;
                        if (issue.overflow.top > 0) output += `  - Top: ${issue.overflow.top}px\n`;
                        if (issue.overflow.right > 0) output += `  - Right: ${issue.overflow.right}px\n`;
                        if (issue.overflow.bottom > 0) output += `  - Bottom: ${issue.overflow.bottom}px\n`;
                        output += `  - Total overflow: ${issue.overflow.total}px\n`;
                        output += `- **Shape ID:** \`${issue.shape.id}\`\n`;
                        output += `\n`;
                    });
                }
            });

            if (result.suggestions && result.suggestions.length > 0) {
                output += `## Suggestions\n\n`;
                result.suggestions.forEach((suggestion: string) => {
                    output += `${suggestion}\n`;
                });
            }
        }

        return new TextResponse(output);
    }
}
