import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Automatically fixes content clipping issues where elements extend beyond their parent bounds.
 * Provides multiple fix strategies: expand parent, reposition child, or apply flex layout.
 */
export class FixClippingTool extends Tool<{
    target: string;
    strategy?: string;
    padding?: number;
    dryRun?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to fix clipping: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
            strategy: z.enum(["expand-parent", "reposition-child", "apply-flex", "auto"]).optional().describe(
                'Fix strategy: "expand-parent" (resize parent to fit children), "reposition-child" (move children within bounds), ' +
                '"apply-flex" (add flex layout for auto-handling), "auto" (choose best strategy per issue). Default: "auto"'
            ),
            padding: z.number().optional().describe(
                'Additional padding to add when expanding parent (in pixels). Default: 8'
            ),
            dryRun: z.boolean().optional().describe(
                'If true, only report what would be fixed without making changes. Default: false'
            ),
        });
    }

    getToolName(): string {
        return "fix_clipping";
    }

    getToolDescription(): string {
        return (
            "Automatically fixes content clipping issues where child elements extend beyond their parent's bounds. " +
            "Strategies: expand-parent (resize container), reposition-child (move within bounds), " +
            "apply-flex (add flex layout), or auto (choose best). Use dryRun=true to preview changes."
        );
    }

    protected async executeCore(args: {
        target: string;
        strategy?: string;
        padding?: number;
        dryRun?: boolean;
    }): Promise<ToolResponse> {
        const strategy = args.strategy || "auto";
        const padding = args.padding ?? 8;
        const dryRun = args.dryRun ?? false;

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

            const strategy = ${JSON.stringify(strategy)};
            const padding = ${padding};
            const dryRun = ${dryRun};

            /**
             * Calculate the bounding box of all children relative to parent
             */
            const getChildrenBounds = (container) => {
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
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    maxX,
                    maxY
                };
            };

            /**
             * Determine the best fix strategy for a clipping issue
             */
            const chooseBestStrategy = (issue) => {
                const { shape, parent, overflow } = issue;
                
                // If parent is a board without layout, prefer applying flex
                if (parent.type === 'board' && !parent.flex && !parent.grid) {
                    return 'apply-flex';
                }
                
                // If overflow is relatively small, expand parent
                const totalOverflow = overflow.left + overflow.top + overflow.right + overflow.bottom;
                if (totalOverflow < 50) {
                    return 'expand-parent';
                }
                
                // If child is significantly outside parent, reposition
                if (overflow.left > parent.width * 0.25 || overflow.right > parent.width * 0.25 ||
                    overflow.top > parent.height * 0.25 || overflow.bottom > parent.height * 0.25) {
                    return 'reposition-child';
                }
                
                return 'expand-parent';
            };

            /**
             * Fix a clipping issue by expanding the parent
             */
            const fixByExpandingParent = (parent, overflow, padding) => {
                const newX = parent.x - overflow.left - padding;
                const newY = parent.y - overflow.top - padding;
                const newWidth = parent.width + overflow.left + overflow.right + (padding * 2);
                const newHeight = parent.height + overflow.top + overflow.bottom + (padding * 2);

                if (!dryRun) {
                    parent.x = newX;
                    parent.y = newY;
                    parent.resize(newWidth, newHeight);
                }

                return {
                    action: 'expanded-parent',
                    parent: parent.name,
                    oldSize: { width: parent.width, height: parent.height },
                    newSize: { width: newWidth, height: newHeight },
                    applied: !dryRun
                };
            };

            /**
             * Fix a clipping issue by repositioning the child within parent bounds
             */
            const fixByRepositioningChild = (shape, parent, overflow) => {
                let newX = shape.x;
                let newY = shape.y;

                // Move child to be within parent bounds
                if (overflow.left > 0) {
                    newX = parent.x;
                }
                if (overflow.top > 0) {
                    newY = parent.y;
                }
                if (overflow.right > 0) {
                    newX = parent.x + parent.width - shape.width;
                }
                if (overflow.bottom > 0) {
                    newY = parent.y + parent.height - shape.height;
                }

                // Clamp to ensure within bounds
                newX = Math.max(parent.x, Math.min(newX, parent.x + parent.width - shape.width));
                newY = Math.max(parent.y, Math.min(newY, parent.y + parent.height - shape.height));

                if (!dryRun) {
                    shape.x = newX;
                    shape.y = newY;
                }

                return {
                    action: 'repositioned-child',
                    child: shape.name,
                    oldPosition: { x: shape.x, y: shape.y },
                    newPosition: { x: newX, y: newY },
                    applied: !dryRun
                };
            };

            /**
             * Fix a clipping issue by applying flex layout to parent
             */
            const fixByApplyingFlex = (parent) => {
                if (parent.flex || parent.grid) {
                    return {
                        action: 'skipped',
                        reason: 'Parent already has layout system',
                        parent: parent.name,
                        applied: false
                    };
                }

                if (!('addFlexLayout' in parent)) {
                    return {
                        action: 'skipped',
                        reason: 'Parent cannot have flex layout',
                        parent: parent.name,
                        applied: false
                    };
                }

                if (!dryRun) {
                    parent.addFlexLayout();
                    // Suggest reasonable defaults based on children
                    const childrenBounds = getChildrenBounds(parent);
                    if (childrenBounds) {
                        const aspectRatio = childrenBounds.width / childrenBounds.height;
                        parent.flex.dir = aspectRatio > 1.5 ? 'row' : 'column';
                        parent.flex.rowGap = 16;
                        parent.flex.columnGap = 16;
                        parent.flex.verticalPadding = 16;
                        parent.flex.horizontalPadding = 16;
                    }
                }

                return {
                    action: 'applied-flex',
                    parent: parent.name,
                    applied: !dryRun
                };
            };

            // Find all clipping issues
            const clippingIssues = [];
            penpotUtils.analyzeDescendants(targetShape, (root, shape) => {
                if (!shape.parent) return null;

                if (!penpotUtils.isContainedIn(shape, shape.parent)) {
                    const overflow = {
                        left: Math.max(0, shape.parent.x - shape.x),
                        top: Math.max(0, shape.parent.y - shape.y),
                        right: Math.max(0, (shape.x + shape.width) - (shape.parent.x + shape.parent.width)),
                        bottom: Math.max(0, (shape.y + shape.height) - (shape.parent.y + shape.parent.height))
                    };

                    clippingIssues.push({
                        shape: shape,
                        parent: shape.parent,
                        overflow,
                        shapeInfo: { id: shape.id, name: shape.name, type: shape.type },
                        parentInfo: { id: shape.parent.id, name: shape.parent.name, type: shape.parent.type }
                    });
                }
                return null;
            });

            // Group issues by parent (so we can fix parent once for multiple children)
            const issuesByParent = {};
            clippingIssues.forEach(issue => {
                const parentId = issue.parent.id;
                if (!issuesByParent[parentId]) {
                    issuesByParent[parentId] = {
                        parent: issue.parent,
                        parentInfo: issue.parentInfo,
                        issues: [],
                        combinedOverflow: { left: 0, top: 0, right: 0, bottom: 0 }
                    };
                }
                issuesByParent[parentId].issues.push(issue);
                
                // Combine overflow from all children
                const combined = issuesByParent[parentId].combinedOverflow;
                combined.left = Math.max(combined.left, issue.overflow.left);
                combined.top = Math.max(combined.top, issue.overflow.top);
                combined.right = Math.max(combined.right, issue.overflow.right);
                combined.bottom = Math.max(combined.bottom, issue.overflow.bottom);
            });

            // Apply fixes
            const fixes = [];
            Object.values(issuesByParent).forEach(group => {
                const effectiveStrategy = strategy === 'auto' 
                    ? chooseBestStrategy({ 
                        shape: group.issues[0].shape, 
                        parent: group.parent, 
                        overflow: group.combinedOverflow 
                      })
                    : strategy;

                let fixResult;
                switch (effectiveStrategy) {
                    case 'expand-parent':
                        fixResult = fixByExpandingParent(group.parent, group.combinedOverflow, padding);
                        fixResult.affectedChildren = group.issues.map(i => i.shapeInfo.name);
                        fixes.push(fixResult);
                        break;
                    case 'reposition-child':
                        group.issues.forEach(issue => {
                            fixResult = fixByRepositioningChild(issue.shape, group.parent, issue.overflow);
                            fixes.push(fixResult);
                        });
                        break;
                    case 'apply-flex':
                        fixResult = fixByApplyingFlex(group.parent);
                        fixResult.affectedChildren = group.issues.map(i => i.shapeInfo.name);
                        fixes.push(fixResult);
                        break;
                }
            });

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                strategy: strategy,
                dryRun: dryRun,
                issuesFound: clippingIssues.length,
                parentsAffected: Object.keys(issuesByParent).length,
                fixes: fixes,
                summary: {
                    expanded: fixes.filter(f => f.action === 'expanded-parent').length,
                    repositioned: fixes.filter(f => f.action === 'repositioned-child').length,
                    flexApplied: fixes.filter(f => f.action === 'applied-flex').length,
                    skipped: fixes.filter(f => f.action === 'skipped').length
                }
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Fix clipping failed: ${result.error}`);
        }

        // Format the results
        let output = `# Clipping Fix Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Strategy:** ${result.strategy}\n`;
        output += `**Mode:** ${result.dryRun ? 'DRY RUN (no changes applied)' : 'APPLIED'}\n\n`;

        output += `## Summary\n\n`;
        output += `- **Clipping issues found:** ${result.issuesFound}\n`;
        output += `- **Parents affected:** ${result.parentsAffected}\n`;
        output += `- **Parents expanded:** ${result.summary.expanded}\n`;
        output += `- **Children repositioned:** ${result.summary.repositioned}\n`;
        output += `- **Flex layouts applied:** ${result.summary.flexApplied}\n`;
        output += `- **Skipped:** ${result.summary.skipped}\n\n`;

        if (result.issuesFound === 0) {
            output += `✅ **No clipping issues found!** All elements are properly contained.\n`;
        } else if (result.dryRun) {
            output += `## Proposed Fixes (Dry Run)\n\n`;
            output += `The following changes would be applied:\n\n`;
            result.fixes.forEach((fix: any, index: number) => {
                output += `### Fix ${index + 1}: ${fix.action}\n`;
                if (fix.action === 'expanded-parent') {
                    output += `- **Parent:** ${fix.parent}\n`;
                    output += `- **New size:** ${Math.round(fix.newSize.width)}x${Math.round(fix.newSize.height)}px\n`;
                    if (fix.affectedChildren) {
                        output += `- **Affected children:** ${fix.affectedChildren.join(', ')}\n`;
                    }
                } else if (fix.action === 'repositioned-child') {
                    output += `- **Child:** ${fix.child}\n`;
                    output += `- **New position:** (${Math.round(fix.newPosition.x)}, ${Math.round(fix.newPosition.y)})\n`;
                } else if (fix.action === 'applied-flex') {
                    output += `- **Parent:** ${fix.parent}\n`;
                    if (fix.affectedChildren) {
                        output += `- **Affected children:** ${fix.affectedChildren.join(', ')}\n`;
                    }
                } else if (fix.action === 'skipped') {
                    output += `- **Parent:** ${fix.parent}\n`;
                    output += `- **Reason:** ${fix.reason}\n`;
                }
                output += `\n`;
            });
            output += `\n💡 **Run without dryRun to apply these fixes.**\n`;
        } else {
            output += `## Applied Fixes\n\n`;
            result.fixes.forEach((fix: any, index: number) => {
                const status = fix.applied ? '✅' : '⚠️';
                output += `${status} **${fix.action}**`;
                if (fix.parent) output += ` - ${fix.parent}`;
                if (fix.child) output += ` - ${fix.child}`;
                if (fix.reason) output += ` (${fix.reason})`;
                output += `\n`;
            });
            output += `\n✅ **Clipping issues have been fixed!**\n`;
        }

        return new TextResponse(output);
    }
}
