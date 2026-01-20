import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Analyzes a container's children and suggests optimal flex or grid configuration.
 * Helps users configure layouts correctly based on content structure.
 */
export class SuggestLayoutTool extends Tool<{
    target: string;
    autoApply?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target container to analyze: "selection" for current selection, or a shape ID'
            ),
            autoApply: z.boolean().optional().describe(
                'If true, automatically apply the suggested layout configuration. Default: false'
            ),
        });
    }

    getToolName(): string {
        return "suggest_layout";
    }

    getToolDescription(): string {
        return (
            "Analyzes a container's children and suggests optimal flex or grid configuration. " +
            "Examines child positions, dimensions, and types to recommend direction, alignment, gap, and padding. " +
            "Use autoApply=true to automatically configure the layout."
        );
    }

    protected async executeCore(args: {
        target: string;
        autoApply?: boolean;
    }): Promise<ToolResponse> {
        const autoApply = args.autoApply ?? false;

        const code = `
            // Get target shape
            let container;
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a container." };
                }
                container = penpot.selection[0];
            } else {
                container = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!container) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
            }

            if (!('children' in container) || !container.children || container.children.length === 0) {
                return { error: "Container has no children to analyze." };
            }

            const autoApply = ${autoApply};
            const spacingScale = [4, 8, 12, 16, 24, 32];

            /**
             * Find the nearest spacing scale value
             */
            const nearestSpacing = (value) => {
                return spacingScale.reduce((prev, curr) => 
                    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
                );
            };

            /**
             * Analyze children arrangement
             */
            const analyzeArrangement = (children) => {
                if (children.length < 2) {
                    return { direction: 'column', confidence: 0.5, reason: 'Only one child - defaulting to column' };
                }

                // Calculate centers of each child
                const centers = children.map(child => ({
                    x: child.x + child.width / 2,
                    y: child.y + child.height / 2,
                    width: child.width,
                    height: child.height
                }));

                // Sort by x and y to detect arrangement
                const sortedByX = [...centers].sort((a, b) => a.x - b.x);
                const sortedByY = [...centers].sort((a, b) => a.y - b.y);

                // Calculate variance in x and y positions
                const avgX = centers.reduce((sum, c) => sum + c.x, 0) / centers.length;
                const avgY = centers.reduce((sum, c) => sum + c.y, 0) / centers.length;
                
                const varianceX = centers.reduce((sum, c) => sum + Math.pow(c.x - avgX, 2), 0) / centers.length;
                const varianceY = centers.reduce((sum, c) => sum + Math.pow(c.y - avgY, 2), 0) / centers.length;

                // Detect if elements are arranged in a row or column
                // Low variance in Y + high variance in X = row
                // Low variance in X + high variance in Y = column
                const xSpread = Math.sqrt(varianceX);
                const ySpread = Math.sqrt(varianceY);

                // Also check if elements overlap significantly (grid-like)
                let overlapsX = 0, overlapsY = 0;
                for (let i = 0; i < children.length; i++) {
                    for (let j = i + 1; j < children.length; j++) {
                        const a = children[i];
                        const b = children[j];
                        
                        // Check X overlap
                        if (a.x < b.x + b.width && a.x + a.width > b.x) {
                            overlapsX++;
                        }
                        // Check Y overlap
                        if (a.y < b.y + b.height && a.y + a.height > b.y) {
                            overlapsY++;
                        }
                    }
                }

                const totalPairs = children.length * (children.length - 1) / 2;
                const xOverlapRatio = overlapsX / totalPairs;
                const yOverlapRatio = overlapsY / totalPairs;

                // Decision logic
                if (xOverlapRatio > 0.8 && yOverlapRatio < 0.3) {
                    // Elements share X positions but are spread in Y -> column
                    return { 
                        direction: 'column', 
                        confidence: 0.9, 
                        reason: 'Children are stacked vertically with similar X positions'
                    };
                }
                
                if (yOverlapRatio > 0.8 && xOverlapRatio < 0.3) {
                    // Elements share Y positions but are spread in X -> row
                    return { 
                        direction: 'row', 
                        confidence: 0.9, 
                        reason: 'Children are arranged horizontally with similar Y positions'
                    };
                }

                // Use variance as fallback
                if (xSpread > ySpread * 1.5) {
                    return { 
                        direction: 'row', 
                        confidence: 0.7, 
                        reason: 'Children have more horizontal spread than vertical'
                    };
                }
                
                if (ySpread > xSpread * 1.5) {
                    return { 
                        direction: 'column', 
                        confidence: 0.7, 
                        reason: 'Children have more vertical spread than horizontal'
                    };
                }

                // Check if it might be a grid
                if (xOverlapRatio > 0.3 && yOverlapRatio > 0.3 && children.length >= 4) {
                    return {
                        direction: 'grid',
                        confidence: 0.6,
                        reason: 'Children appear to be arranged in a grid pattern'
                    };
                }

                // Default to column for unclear cases
                return { 
                    direction: 'column', 
                    confidence: 0.4, 
                    reason: 'Arrangement unclear - defaulting to column (most common)'
                };
            };

            /**
             * Calculate suggested gap based on child distances
             */
            const suggestGap = (children, direction) => {
                if (children.length < 2) {
                    return { gap: 16, confidence: 0.5, reason: 'Default gap for single child' };
                }

                const gaps = [];
                
                // Sort children by position in the layout direction
                const sorted = [...children].sort((a, b) => {
                    if (direction === 'row') {
                        return a.x - b.x;
                    }
                    return a.y - b.y;
                });

                // Calculate gaps between adjacent children
                for (let i = 0; i < sorted.length - 1; i++) {
                    const current = sorted[i];
                    const next = sorted[i + 1];
                    
                    let gap;
                    if (direction === 'row') {
                        gap = next.x - (current.x + current.width);
                    } else {
                        gap = next.y - (current.y + current.height);
                    }
                    
                    if (gap > 0) {
                        gaps.push(gap);
                    }
                }

                if (gaps.length === 0) {
                    return { gap: 16, confidence: 0.5, reason: 'No measurable gaps - using default' };
                }

                // Calculate average gap and snap to scale
                const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
                const suggestedGap = nearestSpacing(avgGap);

                // Check consistency
                const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
                const stdDev = Math.sqrt(variance);
                const consistency = stdDev < avgGap * 0.3 ? 'high' : stdDev < avgGap * 0.5 ? 'medium' : 'low';

                return {
                    gap: suggestedGap,
                    measured: Math.round(avgGap),
                    confidence: consistency === 'high' ? 0.9 : consistency === 'medium' ? 0.7 : 0.5,
                    reason: \`Average gap: \${Math.round(avgGap)}px (consistency: \${consistency})\`
                };
            };

            /**
             * Suggest alignment based on child positions
             */
            const suggestAlignment = (children, direction, containerBounds) => {
                if (children.length === 0) {
                    return { alignItems: 'start', justifyContent: 'start', confidence: 0.5 };
                }

                // Calculate bounds
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                children.forEach(child => {
                    minX = Math.min(minX, child.x);
                    minY = Math.min(minY, child.y);
                    maxX = Math.max(maxX, child.x + child.width);
                    maxY = Math.max(maxY, child.y + child.height);
                });

                const contentCenterX = (minX + maxX) / 2;
                const contentCenterY = (minY + maxY) / 2;
                const containerCenterX = containerBounds.x + containerBounds.width / 2;
                const containerCenterY = containerBounds.y + containerBounds.height / 2;

                // Determine cross-axis alignment (alignItems)
                let alignItems = 'start';
                let alignConfidence = 0.6;

                if (direction === 'row') {
                    // For row, check Y alignment
                    const yOffsets = children.map(c => c.y - containerBounds.y);
                    const avgOffset = yOffsets.reduce((s, o) => s + o, 0) / yOffsets.length;
                    const containerMidY = containerBounds.height / 2;
                    
                    if (Math.abs(avgOffset - containerMidY) < containerBounds.height * 0.15) {
                        alignItems = 'center';
                        alignConfidence = 0.8;
                    } else if (avgOffset > containerMidY) {
                        alignItems = 'end';
                        alignConfidence = 0.7;
                    }
                } else {
                    // For column, check X alignment
                    const xOffsets = children.map(c => c.x - containerBounds.x);
                    const avgOffset = xOffsets.reduce((s, o) => s + o, 0) / xOffsets.length;
                    const containerMidX = containerBounds.width / 2;
                    
                    if (Math.abs(avgOffset - containerMidX) < containerBounds.width * 0.15) {
                        alignItems = 'center';
                        alignConfidence = 0.8;
                    } else if (avgOffset > containerMidX) {
                        alignItems = 'end';
                        alignConfidence = 0.7;
                    }
                }

                // Determine main-axis distribution (justifyContent)
                let justifyContent = 'start';
                let justifyConfidence = 0.6;

                // Check if content is centered or distributed
                if (direction === 'row') {
                    if (Math.abs(contentCenterX - containerCenterX) < containerBounds.width * 0.1) {
                        justifyContent = 'center';
                        justifyConfidence = 0.8;
                    }
                } else {
                    if (Math.abs(contentCenterY - containerCenterY) < containerBounds.height * 0.1) {
                        justifyContent = 'center';
                        justifyConfidence = 0.8;
                    }
                }

                return {
                    alignItems,
                    alignConfidence,
                    justifyContent,
                    justifyConfidence,
                    confidence: (alignConfidence + justifyConfidence) / 2
                };
            };

            /**
             * Suggest padding based on content position
             */
            const suggestPadding = (children, containerBounds) => {
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                children.forEach(child => {
                    minX = Math.min(minX, child.x);
                    minY = Math.min(minY, child.y);
                    maxX = Math.max(maxX, child.x + child.width);
                    maxY = Math.max(maxY, child.y + child.height);
                });

                const leftPadding = minX - containerBounds.x;
                const topPadding = minY - containerBounds.y;
                const rightPadding = (containerBounds.x + containerBounds.width) - maxX;
                const bottomPadding = (containerBounds.y + containerBounds.height) - maxY;

                // Suggest uniform padding if possible
                const paddings = [leftPadding, topPadding, rightPadding, bottomPadding].filter(p => p > 0);
                const avgPadding = paddings.length > 0 ? paddings.reduce((s, p) => s + p, 0) / paddings.length : 16;
                const suggestedPadding = nearestSpacing(Math.max(8, avgPadding));

                return {
                    measured: {
                        top: Math.round(topPadding),
                        right: Math.round(rightPadding),
                        bottom: Math.round(bottomPadding),
                        left: Math.round(leftPadding)
                    },
                    suggested: suggestedPadding,
                    uniform: Math.max(...paddings) - Math.min(...paddings) < 8
                };
            };

            // Perform analysis
            const children = container.children;
            const containerBounds = {
                x: container.x,
                y: container.y,
                width: container.width,
                height: container.height
            };

            const arrangementAnalysis = analyzeArrangement(children);
            const gapAnalysis = suggestGap(children, arrangementAnalysis.direction);
            const alignmentAnalysis = suggestAlignment(children, arrangementAnalysis.direction, containerBounds);
            const paddingAnalysis = suggestPadding(children, containerBounds);

            const suggestion = {
                container: {
                    id: container.id,
                    name: container.name,
                    type: container.type,
                    currentLayout: container.flex ? 'flex' : container.grid ? 'grid' : 'none'
                },
                childCount: children.length,
                analysis: {
                    arrangement: arrangementAnalysis,
                    gap: gapAnalysis,
                    alignment: alignmentAnalysis,
                    padding: paddingAnalysis
                },
                recommendation: {
                    layoutType: arrangementAnalysis.direction === 'grid' ? 'grid' : 'flex',
                    direction: arrangementAnalysis.direction === 'grid' ? null : arrangementAnalysis.direction,
                    gap: gapAnalysis.gap,
                    alignItems: alignmentAnalysis.alignItems,
                    justifyContent: alignmentAnalysis.justifyContent,
                    padding: paddingAnalysis.suggested,
                    overallConfidence: (
                        arrangementAnalysis.confidence + 
                        gapAnalysis.confidence + 
                        alignmentAnalysis.confidence
                    ) / 3
                }
            };

            // Apply if requested
            if (autoApply && suggestion.recommendation.layoutType === 'flex') {
                if (!container.flex) {
                    container.addFlexLayout();
                }
                container.flex.dir = suggestion.recommendation.direction;
                if (suggestion.recommendation.direction === 'row') {
                    container.flex.columnGap = suggestion.recommendation.gap;
                } else {
                    container.flex.rowGap = suggestion.recommendation.gap;
                }
                container.flex.alignItems = suggestion.recommendation.alignItems;
                container.flex.justifyContent = suggestion.recommendation.justifyContent;
                container.flex.verticalPadding = suggestion.recommendation.padding;
                container.flex.horizontalPadding = suggestion.recommendation.padding;
                
                suggestion.applied = true;
            } else {
                suggestion.applied = false;
            }

            return suggestion;
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Layout suggestion failed: ${result.error}`);
        }

        // Format the results
        let output = `# Layout Suggestion Results\n\n`;
        output += `**Container:** ${result.container.name} (${result.container.type})\n`;
        output += `**Current Layout:** ${result.container.currentLayout}\n`;
        output += `**Children:** ${result.childCount}\n\n`;

        output += `## Analysis\n\n`;
        
        output += `### Arrangement\n`;
        output += `- **Detected:** ${result.analysis.arrangement.direction}\n`;
        output += `- **Confidence:** ${Math.round(result.analysis.arrangement.confidence * 100)}%\n`;
        output += `- **Reason:** ${result.analysis.arrangement.reason}\n\n`;

        output += `### Spacing\n`;
        output += `- **Measured gap:** ${result.analysis.gap.measured}px\n`;
        output += `- **Suggested gap:** ${result.analysis.gap.gap}px\n`;
        output += `- **Reason:** ${result.analysis.gap.reason}\n\n`;

        output += `### Alignment\n`;
        output += `- **Align items:** ${result.analysis.alignment.alignItems} (${Math.round(result.analysis.alignment.alignConfidence * 100)}% confidence)\n`;
        output += `- **Justify content:** ${result.analysis.alignment.justifyContent} (${Math.round(result.analysis.alignment.justifyConfidence * 100)}% confidence)\n\n`;

        output += `### Padding\n`;
        output += `- **Measured:** top=${result.analysis.padding.measured.top}, right=${result.analysis.padding.measured.right}, bottom=${result.analysis.padding.measured.bottom}, left=${result.analysis.padding.measured.left}\n`;
        output += `- **Suggested:** ${result.analysis.padding.suggested}px (uniform)\n`;
        output += `- **Is uniform:** ${result.analysis.padding.uniform ? 'Yes' : 'No'}\n\n`;

        output += `## Recommendation\n\n`;
        const rec = result.recommendation;
        output += `| Property | Value |\n`;
        output += `|----------|-------|\n`;
        output += `| Layout Type | ${rec.layoutType} |\n`;
        if (rec.direction) {
            output += `| Direction | ${rec.direction} |\n`;
        }
        output += `| Gap | ${rec.gap}px |\n`;
        output += `| Align Items | ${rec.alignItems} |\n`;
        output += `| Justify Content | ${rec.justifyContent} |\n`;
        output += `| Padding | ${rec.padding}px |\n`;
        output += `| **Overall Confidence** | **${Math.round(rec.overallConfidence * 100)}%** |\n\n`;

        if (result.applied) {
            output += `✅ **Layout configuration applied!**\n`;
        } else {
            output += `### Code to Apply\n\n`;
            output += `\`\`\`javascript\n`;
            output += `// Apply suggested layout\n`;
            output += `const container = penpotUtils.findShapeById("${result.container.id}");\n`;
            if (result.container.currentLayout === 'none') {
                output += `container.addFlexLayout();\n`;
            }
            output += `container.flex.dir = "${rec.direction}";\n`;
            if (rec.direction === 'row') {
                output += `container.flex.columnGap = ${rec.gap};\n`;
            } else {
                output += `container.flex.rowGap = ${rec.gap};\n`;
            }
            output += `container.flex.alignItems = "${rec.alignItems}";\n`;
            output += `container.flex.justifyContent = "${rec.justifyContent}";\n`;
            output += `container.flex.verticalPadding = ${rec.padding};\n`;
            output += `container.flex.horizontalPadding = ${rec.padding};\n`;
            output += `\`\`\`\n\n`;
            output += `💡 **Run with autoApply=true to apply automatically.**\n`;
        }

        return new TextResponse(output);
    }
}
