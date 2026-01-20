import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Detects and fixes z-order issues where background elements cover foreground content.
 * This is a common problem when creating designs programmatically using appendChild().
 * 
 * Z-order in Penpot:
 * - Index 0 = BACK (rendered first, appears behind)
 * - Last index = FRONT (rendered last, appears on top)
 * 
 * Common issue: When using appendChild(), elements are added to the END (front).
 * If a background panel is added later (e.g., during refactoring), it covers everything.
 */
export class FixZOrderTool extends Tool<{
    target: string;
    autoFix?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to check z-order: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
            autoFix: z.boolean().optional().default(false).describe(
                "If true, automatically reorder elements to fix z-order issues. " +
                "Backgrounds will be moved to back, text to front. Default: false (detection only)"
            ),
        });
    }

    getToolName(): string {
        return "fix_z_order";
    }

    getToolDescription(): string {
        return (
            "Detects and fixes z-order issues where background elements cover foreground content. " +
            "This is critical when creating designs programmatically, as appendChild() adds elements " +
            "to the front (highest index). Use autoFix=true to automatically reorder elements by " +
            "priority: backgrounds → shapes → text."
        );
    }

    protected async executeCore(args: {
        target: string;
        autoFix?: boolean;
    }): Promise<ToolResponse> {
        const autoFix = args.autoFix ?? false;

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

            const autoFix = ${autoFix};

            /**
             * Determines the z-order priority for a shape.
             * Lower priority = should be at back (rendered first)
             * Higher priority = should be at front (rendered last)
             * 
             * Priority levels:
             *   0: Background elements (name contains 'BG', 'Background', 'Panel')
             *   1: Regular rectangles/shapes (content containers)
             *   2: Other shapes (ellipses, paths, etc.)
             *   3: Text elements (should always be on top)
             */
            const getZOrderPriority = (shape) => {
                const name = shape.name.toLowerCase();
                
                // Background elements - should be at back
                if (name.includes('bg') || 
                    name.includes('background') || 
                    name.includes('panel') ||
                    name.includes('backdrop') ||
                    name.includes('overlay')) {
                    return 0;
                }
                
                // Text elements - should be at front
                if (shape.type === 'text') {
                    return 3;
                }
                
                // Regular rectangles (likely content containers, cards, etc.)
                if (shape.type === 'rectangle') {
                    // Check if it looks like a card or container
                    if (name.includes('card') || 
                        name.includes('container') ||
                        name.includes('box') ||
                        name.includes('badge') ||
                        name.includes('button') ||
                        name.includes('progress')) {
                        return 2;
                    }
                    return 1;
                }
                
                // Other shapes (ellipses, paths, images, etc.)
                return 2;
            };

            /**
             * Analyzes a container for z-order issues.
             * Returns issues where lower-priority elements (backgrounds)
             * have higher indices than higher-priority elements (text).
             */
            const analyzeZOrder = (container) => {
                if (!('children' in container) || !container.children || container.children.length < 2) {
                    return [];
                }

                const issues = [];
                const children = container.children;
                
                // Map children with their current index and priority
                const childData = children.map((child, index) => ({
                    shape: child,
                    id: child.id,
                    name: child.name,
                    type: child.type,
                    currentIndex: index,
                    priority: getZOrderPriority(child)
                }));

                // Check for inversions: lower priority elements should have lower indices
                for (let i = 0; i < childData.length; i++) {
                    for (let j = i + 1; j < childData.length; j++) {
                        const a = childData[i]; // lower index (back)
                        const b = childData[j]; // higher index (front)
                        
                        // If a has higher priority than b, but a is behind b, that's an issue
                        if (a.priority > b.priority) {
                            // a should be in front of b, but it's behind
                            issues.push({
                                type: 'inversion',
                                behind: {
                                    id: a.id,
                                    name: a.name,
                                    shapeType: a.type,
                                    priority: a.priority,
                                    currentIndex: a.currentIndex
                                },
                                inFront: {
                                    id: b.id,
                                    name: b.name,
                                    shapeType: b.type,
                                    priority: b.priority,
                                    currentIndex: b.currentIndex
                                },
                                container: {
                                    id: container.id,
                                    name: container.name
                                }
                            });
                        }
                    }
                }

                // Check for background elements not at the very back
                const backgrounds = childData.filter(c => c.priority === 0);
                const nonBackgrounds = childData.filter(c => c.priority > 0);
                
                backgrounds.forEach(bg => {
                    const bgPosition = bg.currentIndex;
                    const elementsInFront = nonBackgrounds.filter(nb => nb.currentIndex < bgPosition);
                    
                    if (elementsInFront.length > 0) {
                        issues.push({
                            type: 'background-not-at-back',
                            background: {
                                id: bg.id,
                                name: bg.name,
                                currentIndex: bg.currentIndex
                            },
                            coveredElements: elementsInFront.map(e => ({
                                id: e.id,
                                name: e.name,
                                currentIndex: e.currentIndex
                            })),
                            container: {
                                id: container.id,
                                name: container.name
                            }
                        });
                    }
                });

                return issues;
            };

            /**
             * Fixes z-order by sorting children by priority.
             */
            const fixZOrder = (container) => {
                if (!('children' in container) || !container.children || container.children.length < 2) {
                    return { fixed: false, reason: 'No children or only one child' };
                }

                const children = [...container.children];
                
                // Sort by priority (lower priority = lower index = back)
                const sorted = children.sort((a, b) => {
                    return getZOrderPriority(a) - getZOrderPriority(b);
                });

                // Check if order changed
                const orderChanged = children.some((child, i) => child.id !== sorted[i].id);
                
                if (!orderChanged) {
                    return { fixed: false, reason: 'Order already correct' };
                }

                // Apply new order using setParentIndex
                sorted.forEach((child, newIndex) => {
                    child.setParentIndex(newIndex);
                });

                return {
                    fixed: true,
                    newOrder: sorted.map((child, idx) => ({
                        index: idx,
                        name: child.name,
                        type: child.type,
                        priority: getZOrderPriority(child)
                    }))
                };
            };

            // Find all containers to analyze
            const containers = penpotUtils.findShapes(
                shape => 'children' in shape && shape.children && shape.children.length > 1,
                targetShape
            );
            
            // Include the target itself if it's a container
            if ('children' in targetShape && targetShape.children && targetShape.children.length > 1) {
                containers.unshift(targetShape);
            }

            const allIssues = [];
            const fixedContainers = [];
            const unfixedContainers = [];

            // Analyze each container
            containers.forEach(container => {
                const issues = analyzeZOrder(container);
                
                if (issues.length > 0) {
                    allIssues.push(...issues);
                    
                    if (autoFix) {
                        const result = fixZOrder(container);
                        if (result.fixed) {
                            fixedContainers.push({
                                id: container.id,
                                name: container.name,
                                newOrder: result.newOrder
                            });
                        } else {
                            unfixedContainers.push({
                                id: container.id,
                                name: container.name,
                                reason: result.reason
                            });
                        }
                    }
                }
            });

            // Group issues by type
            const inversions = allIssues.filter(i => i.type === 'inversion');
            const backgroundIssues = allIssues.filter(i => i.type === 'background-not-at-back');

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                containersAnalyzed: containers.length,
                totalIssues: allIssues.length,
                summary: {
                    inversions: inversions.length,
                    backgroundsNotAtBack: backgroundIssues.length
                },
                issues: allIssues.slice(0, 20), // Limit to first 20 issues
                autoFix: autoFix,
                fixed: autoFix ? {
                    containersFixed: fixedContainers.length,
                    details: fixedContainers.slice(0, 10)
                } : null,
                suggestions: autoFix ? [] : [
                    "To automatically fix z-order issues, run this tool with autoFix: true",
                    "The fix will sort elements by priority: backgrounds → shapes → text",
                    "Manual fix pattern:",
                    "  sorted.forEach((child, idx) => child.setParentIndex(idx));",
                    "",
                    "Z-Order Priority Reference:",
                    "  0 (BACK): Elements named 'BG', 'Background', 'Panel'",
                    "  1 (MID-BACK): Plain rectangles",
                    "  2 (MID-FRONT): Cards, containers, buttons, other shapes",
                    "  3 (FRONT): Text elements"
                ]
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Z-order analysis failed: ${result.error}`);
        }

        // Format the results
        let output = `# Z-Order Analysis Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Containers Analyzed:** ${result.containersAnalyzed}\n`;
        output += `**Total Issues:** ${result.totalIssues}\n\n`;

        if (result.totalIssues === 0) {
            output += `✅ **No z-order issues detected!** All elements are layered correctly.\n`;
        } else {
            output += `## Issue Summary\n\n`;
            output += `- **Z-order inversions:** ${result.summary.inversions}\n`;
            output += `- **Backgrounds not at back:** ${result.summary.backgroundsNotAtBack}\n\n`;

            // Show issues
            const inversions = result.issues.filter((i: any) => i.type === 'inversion');
            const backgroundIssues = result.issues.filter((i: any) => i.type === 'background-not-at-back');

            if (inversions.length > 0) {
                output += `## ⚠️ Z-Order Inversions\n\n`;
                output += `These elements are layered incorrectly (higher priority behind lower priority):\n\n`;
                inversions.slice(0, 10).forEach((issue: any) => {
                    output += `### In container: ${issue.container.name}\n`;
                    output += `- **"${issue.behind.name}"** (${issue.behind.shapeType}, priority ${issue.behind.priority}) is BEHIND\n`;
                    output += `- **"${issue.inFront.name}"** (${issue.inFront.shapeType}, priority ${issue.inFront.priority})\n`;
                    output += `- But "${issue.behind.name}" should be IN FRONT based on element type\n\n`;
                });
            }

            if (backgroundIssues.length > 0) {
                output += `## 🔴 Backgrounds Covering Content\n\n`;
                output += `These background elements are in front of content they should be behind:\n\n`;
                backgroundIssues.slice(0, 10).forEach((issue: any) => {
                    output += `### In container: ${issue.container.name}\n`;
                    output += `- **Background:** "${issue.background.name}" (index ${issue.background.currentIndex})\n`;
                    output += `- **Covering:**\n`;
                    issue.coveredElements.slice(0, 5).forEach((el: any) => {
                        output += `  - "${el.name}" (index ${el.currentIndex})\n`;
                    });
                    output += `\n`;
                });
            }
        }

        // Show fix results if auto-fix was enabled
        if (result.autoFix && result.fixed) {
            output += `## 🔧 Auto-Fix Results\n\n`;
            output += `**Containers fixed:** ${result.fixed.containersFixed}\n\n`;
            
            if (result.fixed.details && result.fixed.details.length > 0) {
                output += `### Fixed Containers\n\n`;
                result.fixed.details.forEach((container: any) => {
                    output += `**${container.name}** - New order:\n`;
                    container.newOrder.forEach((item: any) => {
                        const priorityLabel = ['BG', 'Shape', 'Content', 'Text'][item.priority] || 'Unknown';
                        output += `  ${item.index}. ${item.name} (${item.type}) [${priorityLabel}]\n`;
                    });
                    output += `\n`;
                });
            }
        }

        // Show suggestions if not auto-fixing
        if (!result.autoFix && result.suggestions && result.suggestions.length > 0) {
            output += `## 💡 Suggestions\n\n`;
            result.suggestions.forEach((suggestion: string) => {
                output += `${suggestion}\n`;
            });
        }

        return new TextResponse(output);
    }
}
