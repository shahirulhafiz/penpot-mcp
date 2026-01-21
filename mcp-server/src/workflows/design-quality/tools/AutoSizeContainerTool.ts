import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Automatically sizes containers to fit their content with optional padding.
 * Useful for fixing containers that are too small (causing clipping) or too large (wasted space).
 *
 * IMPORTANT: For buttons and elements in flex/grid layouts, use "flex-fit" mode which uses
 * native Penpot flex sizing (horizontalSizing/verticalSizing = "fit-content"). This avoids
 * position drift that occurs with manual resize modes.
 */
export class AutoSizeContainerTool extends Tool<{
    target: string;
    mode?: string;
    padding?: number;
    horizontalPadding?: number;
    verticalPadding?: number;
    minWidth?: number;
    minHeight?: number;
    recursive?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target container(s) to resize: "selection" for current selection, "page" for all boards on page, or a shape ID'
            ),
            mode: z.enum(["fit", "fit-expand-only", "fit-shrink-only", "flex-fit", "button"]).optional().describe(
                'Sizing mode:\n' +
                '- "fit": Manually resize to exactly fit content (may change position)\n' +
                '- "fit-expand-only": Only expand, never shrink (may change position)\n' +
                '- "fit-shrink-only": Only shrink, never expand (may change position)\n' +
                '- "flex-fit": Use native flex fit-content sizing (RECOMMENDED for layouts - no position change)\n' +
                '- "button": Optimized for buttons with proper padding and touch target size\n' +
                'Default: "fit". Use "flex-fit" or "button" for elements in flex/grid layouts to avoid position drift.'
            ),
            padding: z.number().optional().describe(
                'Uniform padding to add around content (in pixels). Default: 16 for fit modes, 8 for button mode'
            ),
            horizontalPadding: z.number().optional().describe(
                'Horizontal padding (overrides uniform padding). Default for button mode: 16'
            ),
            verticalPadding: z.number().optional().describe(
                'Vertical padding (overrides uniform padding). Default for button mode: 8'
            ),
            minWidth: z.number().optional().describe(
                'Minimum width constraint (in pixels). Default: none'
            ),
            minHeight: z.number().optional().describe(
                'Minimum height constraint (in pixels). Default: 44 for button mode (touch target)'
            ),
            recursive: z.boolean().optional().describe(
                'If true, recursively resize all nested containers. Default: false'
            ),
        });
    }

    getToolName(): string {
        return "auto_size_container";
    }

    getToolDescription(): string {
        return (
            "Automatically resizes containers to fit their content with configurable padding. " +
            "Modes: fit (manual resize), flex-fit (native flex sizing - BEST for layouts), button (optimized for buttons). " +
            "IMPORTANT: Use 'flex-fit' or 'button' mode for elements in flex/grid layouts to avoid position drift."
        );
    }

    protected async executeCore(args: {
        target: string;
        mode?: string;
        padding?: number;
        horizontalPadding?: number;
        verticalPadding?: number;
        minWidth?: number;
        minHeight?: number;
        recursive?: boolean;
    }): Promise<ToolResponse> {
        const mode = args.mode || "fit";
        const isFlexMode = mode === "flex-fit" || mode === "button";

        // Default padding based on mode
        let defaultPadding = 16;
        let defaultHPadding = args.horizontalPadding;
        let defaultVPadding = args.verticalPadding;

        if (mode === "button") {
            defaultHPadding = args.horizontalPadding ?? 16;
            defaultVPadding = args.verticalPadding ?? 8;
        }

        const padding = args.padding ?? defaultPadding;
        const horizontalPadding = defaultHPadding ?? padding;
        const verticalPadding = defaultVPadding ?? padding;
        const minWidth = args.minWidth;
        const minHeight = mode === "button" ? (args.minHeight ?? 44) : args.minHeight; // Touch target default for buttons
        const recursive = args.recursive ?? false;

        const code = `
            // Get target shape(s)
            let containers = [];
            
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a container or use 'page' as target." };
                }
                // Include selected containers
                penpot.selection.forEach(shape => {
                    if ('children' in shape && shape.children && shape.children.length > 0) {
                        containers.push(shape);
                    }
                });
                if (containers.length === 0) {
                    return { error: "Selected shape(s) have no children. Select a container with content." };
                }
            } else if (${JSON.stringify(args.target)} === "page") {
                // Find all boards with children
                containers = penpotUtils.findShapes(
                    shape => shape.type === 'board' && 'children' in shape && shape.children && shape.children.length > 0,
                    penpot.root
                );
            } else {
                const shape = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!shape) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
                if (!('children' in shape) || !shape.children || shape.children.length === 0) {
                    return { error: "Target shape has no children. Select a container with content." };
                }
                containers.push(shape);
            }

            const mode = ${JSON.stringify(mode)};
            const padding = ${padding};
            const horizontalPadding = ${horizontalPadding};
            const verticalPadding = ${verticalPadding};
            const minWidth = ${minWidth !== undefined ? minWidth : 'undefined'};
            const minHeight = ${minHeight !== undefined ? minHeight : 'undefined'};
            const recursive = ${recursive};
            const isFlexMode = mode === 'flex-fit' || mode === 'button';

            /**
             * Calculate the bounding box of all children
             */
            const getContentBounds = (container) => {
                if (!('children' in container) || !container.children || container.children.length === 0) {
                    return null;
                }

                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;

                container.children.forEach(child => {
                    minX = Math.min(minX, child.x);
                    minY = Math.min(minY, child.y);
                    maxX = Math.max(maxX, child.x + child.width);
                    maxY = Math.max(maxY, child.y + child.height);
                });

                return {
                    contentX: minX,
                    contentY: minY,
                    contentWidth: maxX - minX,
                    contentHeight: maxY - minY,
                    // Calculate overflow (negative means content is within bounds)
                    overflowLeft: container.x - minX,
                    overflowTop: container.y - minY,
                    overflowRight: maxX - (container.x + container.width),
                    overflowBottom: maxY - (container.y + container.height)
                };
            };

            /**
             * Apply flex-based fit-content sizing to a container.
             * This uses native Penpot flex layout sizing which doesn't reposition the container.
             */
            const applyFlexFit = (container) => {
                // Check if container supports flex layout
                if (!('addFlexLayout' in container)) {
                    return {
                        name: container.name,
                        id: container.id,
                        action: 'skipped',
                        reason: 'Container does not support flex layout'
                    };
                }

                const wasFlexAdded = !container.flex;

                // Add flex layout if not present
                if (!container.flex) {
                    container.addFlexLayout();
                }

                const flex = container.flex;
                if (!flex) {
                    return {
                        name: container.name,
                        id: container.id,
                        action: 'skipped',
                        reason: 'Failed to add flex layout'
                    };
                }

                const oldHSizing = flex.horizontalSizing;
                const oldVSizing = flex.verticalSizing;
                const oldHPadding = flex.horizontalPadding || 0;
                const oldVPadding = flex.verticalPadding || 0;

                // Set fit-content sizing
                flex.horizontalSizing = 'fit-content';
                flex.verticalSizing = 'fit-content';

                // Set padding
                flex.horizontalPadding = horizontalPadding;
                flex.verticalPadding = verticalPadding;

                // For button mode, center content
                if (mode === 'button') {
                    flex.alignItems = 'center';
                    flex.justifyContent = 'center';
                }

                // Apply minimum size constraints (for touch targets)
                if (minWidth !== undefined && container.width < minWidth) {
                    container.resize(minWidth, container.height);
                }
                if (minHeight !== undefined && container.height < minHeight) {
                    container.resize(container.width, minHeight);
                }

                return {
                    name: container.name,
                    id: container.id,
                    action: 'flex-fit-applied',
                    flexAdded: wasFlexAdded,
                    old: {
                        horizontalSizing: oldHSizing,
                        verticalSizing: oldVSizing,
                        horizontalPadding: oldHPadding,
                        verticalPadding: oldVPadding
                    },
                    new: {
                        horizontalSizing: flex.horizontalSizing,
                        verticalSizing: flex.verticalSizing,
                        horizontalPadding: horizontalPadding,
                        verticalPadding: verticalPadding
                    }
                };
            };

            /**
             * Resize a container to fit its content (manual mode - may reposition)
             */
            const resizeContainer = (container) => {
                const bounds = getContentBounds(container);
                if (!bounds) {
                    return {
                        name: container.name,
                        id: container.id,
                        action: 'skipped',
                        reason: 'No children'
                    };
                }

                const oldWidth = container.width;
                const oldHeight = container.height;
                const oldX = container.x;
                const oldY = container.y;

                // Calculate required size with padding
                let newWidth = bounds.contentWidth + (padding * 2);
                let newHeight = bounds.contentHeight + (padding * 2);

                // Apply mode constraints
                if (mode === 'fit-expand-only') {
                    newWidth = Math.max(oldWidth, newWidth);
                    newHeight = Math.max(oldHeight, newHeight);
                } else if (mode === 'fit-shrink-only') {
                    newWidth = Math.min(oldWidth, newWidth);
                    newHeight = Math.min(oldHeight, newHeight);
                }

                // Apply minimum constraints
                if (minWidth !== undefined) {
                    newWidth = Math.max(minWidth, newWidth);
                }
                if (minHeight !== undefined) {
                    newHeight = Math.max(minHeight, newHeight);
                }

                // Calculate new position to center content with padding
                // The new container position should be: content position - padding
                let newX = bounds.contentX - padding;
                let newY = bounds.contentY - padding;

                // Check if anything changed
                const widthChanged = Math.abs(newWidth - oldWidth) > 0.5;
                const heightChanged = Math.abs(newHeight - oldHeight) > 0.5;
                const positionChanged = Math.abs(newX - oldX) > 0.5 || Math.abs(newY - oldY) > 0.5;

                if (!widthChanged && !heightChanged && !positionChanged) {
                    return {
                        name: container.name,
                        id: container.id,
                        action: 'no-change',
                        reason: 'Already optimal size'
                    };
                }

                // Apply changes
                // First, we need to move children relative to the new container position
                // OR we can keep children in place and adjust container
                
                // Strategy: Keep children in their absolute positions, just resize container
                // This means we might need to reposition the container origin
                
                container.x = newX;
                container.y = newY;
                container.resize(newWidth, newHeight);

                return {
                    name: container.name,
                    id: container.id,
                    action: 'resized',
                    old: {
                        x: Math.round(oldX),
                        y: Math.round(oldY),
                        width: Math.round(oldWidth),
                        height: Math.round(oldHeight)
                    },
                    new: {
                        x: Math.round(newX),
                        y: Math.round(newY),
                        width: Math.round(newWidth),
                        height: Math.round(newHeight)
                    },
                    delta: {
                        width: Math.round(newWidth - oldWidth),
                        height: Math.round(newHeight - oldHeight)
                    }
                };
            };

            /**
             * Process containers recursively (bottom-up to ensure children are sized first)
             */
            const processContainers = (containerList) => {
                const results = [];
                
                // Sort by depth (deepest first for bottom-up processing)
                const withDepth = containerList.map(c => {
                    let depth = 0;
                    let current = c;
                    while (current.parent) {
                        depth++;
                        current = current.parent;
                    }
                    return { container: c, depth };
                });
                
                withDepth.sort((a, b) => b.depth - a.depth);
                
                withDepth.forEach(({ container }) => {
                    // Use flex-based sizing for flex-fit and button modes
                    const result = isFlexMode 
                        ? applyFlexFit(container) 
                        : resizeContainer(container);
                    results.push(result);
                    
                    // If recursive, also process nested containers
                    if (recursive && 'children' in container && container.children) {
                        const nestedContainers = container.children.filter(
                            child => 'children' in child && child.children && child.children.length > 0
                        );
                        if (nestedContainers.length > 0) {
                            results.push(...processContainers(nestedContainers));
                        }
                    }
                });
                
                return results;
            };

            const results = processContainers(containers);

            return {
                mode: mode,
                isFlexMode: isFlexMode,
                padding: isFlexMode ? undefined : padding,
                horizontalPadding: isFlexMode ? horizontalPadding : undefined,
                verticalPadding: isFlexMode ? verticalPadding : undefined,
                minWidth: minWidth,
                minHeight: minHeight,
                recursive: recursive,
                containersProcessed: results.length,
                summary: {
                    resized: results.filter(r => r.action === 'resized').length,
                    flexFitApplied: results.filter(r => r.action === 'flex-fit-applied').length,
                    noChange: results.filter(r => r.action === 'no-change').length,
                    skipped: results.filter(r => r.action === 'skipped').length
                },
                results: results
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Auto-size failed: ${result.error}`);
        }

        // Format the results
        let output = `# Auto-Size Container Results\n\n`;
        output += `**Mode:** ${result.mode}`;
        if (result.isFlexMode) {
            output += ` (native flex sizing - position preserved)\n`;
        } else {
            output += ` (manual resize - may change position)\n`;
        }

        if (result.isFlexMode) {
            output += `**Horizontal Padding:** ${result.horizontalPadding}px\n`;
            output += `**Vertical Padding:** ${result.verticalPadding}px\n`;
        } else {
            output += `**Padding:** ${result.padding}px\n`;
        }
        if (result.minWidth) output += `**Min Width:** ${result.minWidth}px\n`;
        if (result.minHeight) output += `**Min Height:** ${result.minHeight}px\n`;
        output += `**Recursive:** ${result.recursive}\n\n`;

        output += `## Summary\n\n`;
        output += `- **Containers processed:** ${result.containersProcessed}\n`;
        if (result.isFlexMode) {
            output += `- **Flex fit-content applied:** ${result.summary.flexFitApplied}\n`;
        } else {
            output += `- **Resized:** ${result.summary.resized}\n`;
        }
        output += `- **No change needed:** ${result.summary.noChange}\n`;
        output += `- **Skipped:** ${result.summary.skipped}\n\n`;

        const successCount = result.isFlexMode ? result.summary.flexFitApplied : result.summary.resized;

        if (successCount === 0 && result.summary.noChange > 0) {
            output += `✅ **All containers already at optimal size!**\n`;
        } else if (result.isFlexMode && result.summary.flexFitApplied > 0) {
            output += `## Flex Fit-Content Applied\n\n`;
            const applied = result.results.filter((r: any) => r.action === 'flex-fit-applied');
            applied.forEach((r: any) => {
                output += `### ${r.name}\n`;
                if (r.flexAdded) {
                    output += `- **Flex layout added:** Yes\n`;
                }
                output += `- **Sizing:** horizontal=${r.new.horizontalSizing}, vertical=${r.new.verticalSizing}\n`;
                output += `- **Padding:** ${r.new.horizontalPadding}px horizontal, ${r.new.verticalPadding}px vertical\n\n`;
            });
            output += `✅ **${result.summary.flexFitApplied} container(s) configured with flex fit-content!**\n`;
            output += `\n💡 **Note:** Position is preserved. The container will automatically resize to fit its content.\n`;
        } else if (result.summary.resized > 0) {
            output += `## Resized Containers\n\n`;
            const resized = result.results.filter((r: any) => r.action === 'resized');
            resized.forEach((r: any) => {
                output += `### ${r.name}\n`;
                output += `- **Old size:** ${r.old.width}x${r.old.height}px at (${r.old.x}, ${r.old.y})\n`;
                output += `- **New size:** ${r.new.width}x${r.new.height}px at (${r.new.x}, ${r.new.y})\n`;
                output += `- **Delta:** ${r.delta.width > 0 ? '+' : ''}${r.delta.width}w, ${r.delta.height > 0 ? '+' : ''}${r.delta.height}h\n\n`;
            });
            output += `✅ **${result.summary.resized} container(s) resized to fit content!**\n`;
            output += `\n⚠️ **Note:** Manual resize mode may change container positions. For elements in layouts, consider using "flex-fit" or "button" mode.\n`;
        }

        if (result.summary.skipped > 0) {
            output += `\n## Skipped\n\n`;
            const skipped = result.results.filter((r: any) => r.action === 'skipped');
            skipped.forEach((r: any) => {
                output += `- **${r.name}:** ${r.reason}\n`;
            });
        }

        return new TextResponse(output);
    }
}
