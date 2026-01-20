import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Analyzes the structure and hierarchy of a design, providing recommendations for improvements.
 * Detects issues like ungrouped elements, missing intermediate containers, and deep nesting.
 */
export class AnalyzeStructureTool extends Tool<{
    target: string;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to analyze: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
        });
    }

    getToolName(): string {
        return "analyze_structure";
    }

    getToolDescription(): string {
        return (
            "Analyzes the structure and hierarchy of a design. " +
            "Detects issues like ungrouped related elements, missing intermediate containers, " +
            "deep nesting, and missing layout systems. Provides specific recommendations for improvement."
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

            const issues = [];
            const recommendations = [];
            const stats = {
                totalShapes: 0,
                boards: 0,
                rectangles: 0,
                texts: 0,
                groups: 0,
                other: 0,
                maxDepth: 0,
                containersWithLayout: 0,
                containersWithoutLayout: 0
            };

            /**
             * Calculate depth of a shape
             */
            const getDepth = (shape, root) => {
                let depth = 0;
                let current = shape;
                while (current && current.id !== root.id) {
                    depth++;
                    current = current.parent;
                }
                return depth;
            };

            /**
             * Collect all shapes with their metadata
             */
            const collectShapes = (shape, depth = 0) => {
                const shapes = [];
                
                stats.totalShapes++;
                stats.maxDepth = Math.max(stats.maxDepth, depth);
                
                switch (shape.type) {
                    case 'board':
                        stats.boards++;
                        if (shape.flex || shape.grid) {
                            stats.containersWithLayout++;
                        } else if ('children' in shape && shape.children && shape.children.length > 0) {
                            stats.containersWithoutLayout++;
                        }
                        break;
                    case 'rectangle':
                        stats.rectangles++;
                        break;
                    case 'text':
                        stats.texts++;
                        break;
                    case 'group':
                        stats.groups++;
                        break;
                    default:
                        stats.other++;
                }
                
                shapes.push({
                    id: shape.id,
                    name: shape.name,
                    type: shape.type,
                    depth: depth,
                    hasLayout: shape.flex || shape.grid,
                    hasChildren: 'children' in shape && shape.children && shape.children.length > 0,
                    childCount: 'children' in shape && shape.children ? shape.children.length : 0,
                    x: Math.round(shape.x),
                    y: Math.round(shape.y),
                    width: Math.round(shape.width),
                    height: Math.round(shape.height)
                });
                
                if ('children' in shape && shape.children) {
                    shape.children.forEach(child => {
                        shapes.push(...collectShapes(child, depth + 1));
                    });
                }
                
                return shapes;
            };

            const allShapes = collectShapes(targetShape);

            /**
             * Issue 1: Deep nesting (more than 5 levels)
             */
            const deeplyNested = allShapes.filter(s => s.depth > 5);
            if (deeplyNested.length > 0) {
                issues.push({
                    type: 'deep-nesting',
                    severity: 'warning',
                    count: deeplyNested.length,
                    maxDepth: stats.maxDepth,
                    shapes: deeplyNested.slice(0, 5).map(s => ({ name: s.name, depth: s.depth }))
                });
                recommendations.push({
                    type: 'deep-nesting',
                    title: 'Reduce Nesting Depth',
                    description: 'Some elements are nested more than 5 levels deep. Consider:',
                    actions: [
                        'Extract deeply nested groups into reusable components',
                        'Flatten unnecessary intermediate containers',
                        'Use flex layout to reduce need for manual grouping'
                    ]
                });
            }

            /**
             * Issue 2: Containers without layout systems
             */
            const containersNeedingLayout = allShapes.filter(s => 
                s.type === 'board' && 
                !s.hasLayout && 
                s.hasChildren && 
                s.childCount > 1
            );
            if (containersNeedingLayout.length > 0) {
                issues.push({
                    type: 'missing-layout',
                    severity: 'warning',
                    count: containersNeedingLayout.length,
                    shapes: containersNeedingLayout.slice(0, 5).map(s => ({ name: s.name, childCount: s.childCount }))
                });
                recommendations.push({
                    type: 'missing-layout',
                    title: 'Add Layout Systems',
                    description: 'Some containers with multiple children don\\'t have flex or grid layout:',
                    actions: [
                        'Use suggest_layout tool to analyze and apply appropriate layout',
                        'Add flex layout for linear arrangements (row or column)',
                        'Add grid layout for 2D arrangements'
                    ],
                    affectedContainers: containersNeedingLayout.map(s => s.name)
                });
            }

            /**
             * Issue 3: Flat structure (many siblings at same level)
             */
            const containersWithManySiblings = allShapes.filter(s => s.childCount > 10);
            if (containersWithManySiblings.length > 0) {
                issues.push({
                    type: 'flat-structure',
                    severity: 'info',
                    count: containersWithManySiblings.length,
                    shapes: containersWithManySiblings.map(s => ({ name: s.name, childCount: s.childCount }))
                });
                recommendations.push({
                    type: 'flat-structure',
                    title: 'Consider Grouping',
                    description: 'Some containers have many children (10+). Consider grouping related elements:',
                    actions: [
                        'Group related elements into sections (Header, Body, Footer)',
                        'Create component groups for repeating patterns',
                        'Use semantic grouping (Navigation, Content, Actions)'
                    ]
                });
            }

            /**
             * Issue 4: Potential ungrouped elements
             * Look for multiple elements at similar positions that could be grouped
             */
            const findPotentialGroups = (shapes) => {
                const potentialGroups = [];
                
                // Group shapes by their approximate vertical position (within 50px)
                const byApproxY = {};
                shapes.forEach(shape => {
                    const key = Math.floor(shape.y / 50) * 50;
                    if (!byApproxY[key]) byApproxY[key] = [];
                    byApproxY[key].push(shape);
                });
                
                // Check for groups with multiple related elements
                Object.entries(byApproxY).forEach(([y, group]) => {
                    if (group.length >= 3) {
                        // Check if these are siblings (same parent)
                        const firstShape = penpotUtils.findShapeById(group[0].id);
                        if (firstShape && firstShape.parent) {
                            const allSiblings = group.every(s => {
                                const shape = penpotUtils.findShapeById(s.id);
                                return shape && shape.parent && shape.parent.id === firstShape.parent.id;
                            });
                            if (allSiblings) {
                                potentialGroups.push({
                                    y: parseInt(y),
                                    elements: group.map(s => s.name),
                                    parent: firstShape.parent.name
                                });
                            }
                        }
                    }
                });
                
                return potentialGroups;
            };

            const potentialGroups = findPotentialGroups(allShapes.filter(s => s.depth === 1 || s.depth === 2));
            if (potentialGroups.length > 0) {
                issues.push({
                    type: 'potential-grouping',
                    severity: 'info',
                    count: potentialGroups.length,
                    groups: potentialGroups.slice(0, 3)
                });
                recommendations.push({
                    type: 'potential-grouping',
                    title: 'Consider Grouping Related Elements',
                    description: 'Found elements at similar positions that might benefit from grouping:',
                    actions: [
                        'Review elements at similar Y positions',
                        'Group elements that form logical units',
                        'Apply flex layout to groups for consistent spacing'
                    ]
                });
            }

            /**
             * Issue 5: Naming patterns
             */
            const badNamePatterns = [
                /^(Rectangle|Frame|Group|Ellipse|Path|Board|Component)\\s*\\d*$/i
            ];
            const badlyNamed = allShapes.filter(s => 
                badNamePatterns.some(pattern => pattern.test(s.name))
            );
            if (badlyNamed.length > allShapes.length * 0.2) {
                issues.push({
                    type: 'poor-naming',
                    severity: 'warning',
                    count: badlyNamed.length,
                    percentage: Math.round(badlyNamed.length / allShapes.length * 100),
                    examples: badlyNamed.slice(0, 5).map(s => s.name)
                });
                recommendations.push({
                    type: 'poor-naming',
                    title: 'Improve Layer Names',
                    description: \`\${Math.round(badlyNamed.length / allShapes.length * 100)}% of layers have generic names:\`,
                    actions: [
                        'Use audit_layer_names tool to identify and fix naming issues',
                        'Follow naming convention: Title Case descriptive names',
                        'Include context in names (e.g., "Submit Button" not just "Button")'
                    ]
                });
            }

            /**
             * Build hierarchy visualization
             */
            const buildHierarchy = (shape, depth = 0) => {
                const indent = '  '.repeat(depth);
                const layoutIndicator = shape.flex ? ' [flex]' : shape.grid ? ' [grid]' : '';
                const childCount = 'children' in shape && shape.children ? \` (\${shape.children.length})\` : '';
                
                let result = \`\${indent}├── \${shape.name} (\${shape.type})\${layoutIndicator}\${childCount}\\n\`;
                
                if ('children' in shape && shape.children && depth < 4) {
                    shape.children.slice(0, 5).forEach(child => {
                        result += buildHierarchy(child, depth + 1);
                    });
                    if (shape.children.length > 5) {
                        result += \`\${'  '.repeat(depth + 1)}└── ... and \${shape.children.length - 5} more\\n\`;
                    }
                }
                
                return result;
            };

            const hierarchy = buildHierarchy(targetShape);

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                stats: stats,
                issues: issues,
                recommendations: recommendations,
                hierarchy: hierarchy,
                health: {
                    score: Math.max(0, 100 - 
                        (issues.filter(i => i.severity === 'critical').length * 25) -
                        (issues.filter(i => i.severity === 'warning').length * 10) -
                        (issues.filter(i => i.severity === 'info').length * 2)
                    ),
                    status: issues.filter(i => i.severity === 'critical').length > 0 ? 'needs-attention' :
                            issues.filter(i => i.severity === 'warning').length > 2 ? 'could-improve' : 'good'
                }
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Structure analysis failed: ${result.error}`);
        }

        // Format the results
        let output = `# Structure Analysis Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Health Score:** ${result.health.score}/100 (${result.health.status})\n\n`;

        output += `## Statistics\n\n`;
        output += `| Metric | Value |\n`;
        output += `|--------|-------|\n`;
        output += `| Total Shapes | ${result.stats.totalShapes} |\n`;
        output += `| Boards | ${result.stats.boards} |\n`;
        output += `| Rectangles | ${result.stats.rectangles} |\n`;
        output += `| Text Elements | ${result.stats.texts} |\n`;
        output += `| Groups | ${result.stats.groups} |\n`;
        output += `| Other | ${result.stats.other} |\n`;
        output += `| Max Nesting Depth | ${result.stats.maxDepth} |\n`;
        output += `| Containers with Layout | ${result.stats.containersWithLayout} |\n`;
        output += `| Containers without Layout | ${result.stats.containersWithoutLayout} |\n\n`;

        output += `## Hierarchy (First 4 Levels)\n\n`;
        output += `\`\`\`\n${result.hierarchy}\`\`\`\n\n`;

        if (result.issues.length === 0) {
            output += `## ✅ No Issues Found\n\n`;
            output += `The structure follows best practices!\n`;
        } else {
            output += `## Issues Found (${result.issues.length})\n\n`;
            result.issues.forEach((issue: any) => {
                const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                output += `### ${icon} ${issue.type.replace(/-/g, ' ').toUpperCase()}\n`;
                output += `- **Severity:** ${issue.severity}\n`;
                output += `- **Count:** ${issue.count}\n`;
                if (issue.shapes) {
                    output += `- **Affected:** ${issue.shapes.map((s: any) => s.name).join(', ')}\n`;
                }
                if (issue.percentage) {
                    output += `- **Percentage:** ${issue.percentage}% of elements\n`;
                }
                output += `\n`;
            });
        }

        if (result.recommendations.length > 0) {
            output += `## Recommendations\n\n`;
            result.recommendations.forEach((rec: any, index: number) => {
                output += `### ${index + 1}. ${rec.title}\n\n`;
                output += `${rec.description}\n\n`;
                rec.actions.forEach((action: string) => {
                    output += `- ${action}\n`;
                });
                if (rec.affectedContainers) {
                    output += `\n**Affected containers:** ${rec.affectedContainers.join(', ')}\n`;
                }
                output += `\n`;
            });
        }

        return new TextResponse(output);
    }
}
