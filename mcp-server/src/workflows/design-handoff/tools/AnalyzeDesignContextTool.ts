import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";
import { SEMANTIC_PATTERNS } from "./HandoffContext.js";

/**
 * Analyzes the design context before extraction - understanding component hierarchy,
 * layout patterns, and semantic structure. This is the first step in the handoff workflow.
 */
export class AnalyzeDesignContextTool extends Tool<{
    target: string;
    maxDepth?: number;
    inferSemantics?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to analyze: "selection" for current selection, "page" for current page, or a shape ID'
            ),
            maxDepth: z.number().optional().describe(
                'Maximum depth to traverse hierarchy. Default: 6'
            ),
            inferSemantics: z.boolean().optional().describe(
                'Attempt to infer semantic component types (header, card, button, etc.). Default: true'
            ),
        });
    }

    getToolName(): string {
        return "analyze_design_context";
    }

    getToolDescription(): string {
        return (
            "Analyzes the design structure before extraction - component hierarchy, layout patterns, " +
            "and semantic types. Run this FIRST in the handoff workflow to understand what you're implementing. " +
            "Results are stored in context for use by subsequent tools."
        );
    }

    protected async executeCore(args: {
        target: string;
        maxDepth?: number;
        inferSemantics?: boolean;
    }): Promise<ToolResponse> {
        const maxDepth = args.maxDepth ?? 6;
        const inferSemantics = args.inferSemantics ?? true;

        // Convert semantic patterns to serializable format
        const semanticPatternsObj: Record<string, string[]> = {};
        for (const [type, patterns] of Object.entries(SEMANTIC_PATTERNS)) {
            semanticPatternsObj[type] = patterns.map(p => p.source);
        }

        const code = `
            // Initialize context storage
            if (!storage.handoffContext) {
                storage.handoffContext = {};
            }

            // Get target shape
            let targetShape;
            const targetArg = ${JSON.stringify(args.target)};
            
            if (targetArg === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a shape or specify a target." };
                }
                targetShape = penpot.selection[0];
            } else if (targetArg === "page") {
                targetShape = penpot.root;
            } else {
                targetShape = penpotUtils.findShapeById(targetArg);
                if (!targetShape) {
                    return { error: "Shape with ID " + targetArg + " not found." };
                }
            }

            const maxDepth = ${maxDepth};
            const inferSemantics = ${inferSemantics};
            const semanticPatterns = ${JSON.stringify(semanticPatternsObj)};

            /**
             * Infer semantic type from shape name
             */
            function inferSemanticType(name) {
                if (!inferSemantics) return undefined;
                
                const lowerName = name.toLowerCase();
                for (const [type, patterns] of Object.entries(semanticPatterns)) {
                    for (const pattern of patterns) {
                        const regex = new RegExp(pattern, 'i');
                        if (regex.test(lowerName)) {
                            return type;
                        }
                    }
                }
                return undefined;
            }

            /**
             * Detect layout type
             */
            function detectLayout(shape) {
                if ('flex' in shape && shape.flex) {
                    const flex = shape.flex;
                    return {
                        type: 'flex',
                        direction: flex.dir,
                        gap: flex.rowGap || flex.columnGap,
                        padding: {
                            top: flex.topPadding || flex.verticalPadding || 0,
                            right: flex.rightPadding || flex.horizontalPadding || 0,
                            bottom: flex.bottomPadding || flex.verticalPadding || 0,
                            left: flex.leftPadding || flex.horizontalPadding || 0
                        }
                    };
                }
                if ('grid' in shape && shape.grid) {
                    const grid = shape.grid;
                    return {
                        type: 'grid',
                        rows: grid.rows?.length || 0,
                        columns: grid.columns?.length || 0,
                        gap: grid.rowGap || grid.columnGap
                    };
                }
                return { type: 'none' };
            }

            /**
             * Detect if element might be interactive
             */
            function detectInteractivity(shape) {
                const name = shape.name.toLowerCase();
                const interactivePatterns = [
                    { pattern: /button|btn|cta/i, behavior: 'clickable' },
                    { pattern: /link|anchor/i, behavior: 'navigable' },
                    { pattern: /input|field|search/i, behavior: 'editable' },
                    { pattern: /select|dropdown|combo/i, behavior: 'selectable' },
                    { pattern: /checkbox|radio|toggle|switch/i, behavior: 'toggleable' },
                    { pattern: /tab|nav.*item/i, behavior: 'selectable-navigation' },
                    { pattern: /chevron|arrow|prev|next/i, behavior: 'clickable-navigation' },
                    { pattern: /day|date|cell/i, behavior: 'selectable' },
                    { pattern: /card|item|row/i, behavior: 'clickable' },
                ];

                for (const { pattern, behavior } of interactivePatterns) {
                    if (pattern.test(name)) {
                        return behavior;
                    }
                }
                return null;
            }

            /**
             * Analyze shape recursively
             */
            function analyzeShape(shape, depth) {
                const info = {
                    id: shape.id,
                    name: shape.name,
                    type: shape.type,
                    semanticType: inferSemanticType(shape.name),
                    dimensions: {
                        width: Math.round(shape.width),
                        height: Math.round(shape.height)
                    },
                    layout: detectLayout(shape),
                    interactivity: detectInteractivity(shape),
                    children: []
                };

                if (depth < maxDepth && 'children' in shape && shape.children) {
                    info.children = shape.children.map(child => analyzeShape(child, depth + 1));
                }

                return info;
            }

            /**
             * Count layout patterns
             */
            function countLayoutPatterns(info) {
                const counts = { flex: 0, grid: 0, none: 0 };
                
                function count(node) {
                    if (node.layout) {
                        counts[node.layout.type] = (counts[node.layout.type] || 0) + 1;
                    }
                    if (node.children) {
                        node.children.forEach(count);
                    }
                }
                
                count(info);
                return counts;
            }

            /**
             * Find interactive elements
             */
            function findInteractiveElements(info) {
                const elements = [];
                
                function find(node) {
                    if (node.interactivity) {
                        elements.push({
                            name: node.name,
                            id: node.id,
                            behavior: node.interactivity
                        });
                    }
                    if (node.children) {
                        node.children.forEach(find);
                    }
                }
                
                find(info);
                return elements;
            }

            /**
             * Count total elements
             */
            function countElements(info) {
                let count = 1;
                if (info.children) {
                    info.children.forEach(child => {
                        count += countElements(child);
                    });
                }
                return count;
            }

            /**
             * Get max depth
             */
            function getMaxDepth(info, current = 0) {
                let max = current;
                if (info.children && info.children.length > 0) {
                    info.children.forEach(child => {
                        max = Math.max(max, getMaxDepth(child, current + 1));
                    });
                }
                return max;
            }

            // Analyze the design
            const structure = analyzeShape(targetShape, 0);
            const layoutPatterns = countLayoutPatterns(structure);
            const interactiveElements = findInteractiveElements(structure);
            const totalElements = countElements(structure);
            const maxNestingDepth = getMaxDepth(structure);

            // Store in context for other tools
            storage.handoffContext = {
                ...storage.handoffContext,
                targetId: targetShape.id,
                targetName: targetShape.name,
                structure: structure,
                timestamp: Date.now()
            };

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                summary: {
                    totalElements,
                    maxNestingDepth,
                    layoutPatterns: [
                        { pattern: 'flex', count: layoutPatterns.flex },
                        { pattern: 'grid', count: layoutPatterns.grid },
                        { pattern: 'none', count: layoutPatterns.none }
                    ],
                    interactiveCount: interactiveElements.length
                },
                structure,
                interactiveElements: interactiveElements.slice(0, 20), // Limit for readability
                contextSaved: true
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`Error: ${result.error}`);
        }

        // Format output
        let output = `# Design Context Analysis\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**ID:** \`${result.target.id}\`\n\n`;

        output += `## Summary\n\n`;
        output += `| Metric | Value |\n`;
        output += `|--------|-------|\n`;
        output += `| Total Elements | ${result.summary.totalElements} |\n`;
        output += `| Max Nesting Depth | ${result.summary.maxNestingDepth} |\n`;
        output += `| Interactive Elements | ${result.summary.interactiveCount} |\n\n`;

        output += `## Layout Patterns\n\n`;
        output += `| Pattern | Count |\n`;
        output += `|---------|-------|\n`;
        for (const lp of result.summary.layoutPatterns) {
            output += `| ${lp.pattern} | ${lp.count} |\n`;
        }
        output += `\n`;

        if (result.interactiveElements.length > 0) {
            output += `## Interactive Elements\n\n`;
            output += `| Element | Behavior |\n`;
            output += `|---------|----------|\n`;
            for (const ie of result.interactiveElements) {
                output += `| ${ie.name} | ${ie.behavior} |\n`;
            }
            output += `\n`;
        }

        output += `## Structure (Top Level)\n\n`;
        output += this.formatStructure(result.structure, 0, 3);
        output += `\n`;

        output += `---\n`;
        output += `*Context saved. Run \`generate_design_tokens\` next to extract design tokens.*\n`;

        return new TextResponse(output);
    }

    private formatStructure(node: any, depth: number, maxDepth: number): string {
        if (depth > maxDepth) return '';

        const indent = '  '.repeat(depth);
        let line = `${indent}- **${node.name}** (${node.type})`;
        
        if (node.semanticType) {
            line += ` [${node.semanticType}]`;
        }
        if (node.layout && node.layout.type !== 'none') {
            line += ` 📐 ${node.layout.type}`;
            if (node.layout.direction) {
                line += `-${node.layout.direction}`;
            }
        }
        if (node.interactivity) {
            line += ` 👆`;
        }
        line += `\n`;

        if (node.children && node.children.length > 0 && depth < maxDepth) {
            for (const child of node.children.slice(0, 10)) {
                line += this.formatStructure(child, depth + 1, maxDepth);
            }
            if (node.children.length > 10) {
                line += `${indent}  - ... and ${node.children.length - 10} more\n`;
            }
        }

        return line;
    }
}
