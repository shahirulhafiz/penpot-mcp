import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Comprehensive design quality validation tool based on Penpot best practices.
 * Runs QA checks for visual consistency, content visibility, layer organization,
 * layout integrity, and accessibility.
 */
export class ValidateDesignTool extends Tool<{
    target: string;
    checks?: string[];
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to validate: "selection" to validate current selection, "page" for entire page, or a shape ID'
            ),
            checks: z.array(z.string()).optional().describe(
                'Optional array of check types to run. Available: "visual-consistency", "content-visibility", ' +
                '"layer-organization", "layout-integrity", "accessibility". If not specified, runs all checks.'
            ),
        });
    }

    getToolName(): string {
        return "validate_design";
    }

    getToolDescription(): string {
        return (
            "Runs comprehensive design quality checks based on Penpot best practices. " +
            "Detects common issues like content clipping, inconsistent spacing, poor naming, " +
            "missing layouts, and accessibility problems. ALWAYS run this after making design changes."
        );
    }

    protected async executeCore(args: {
        target: string;
        checks?: string[];
    }): Promise<ToolResponse> {
        const allChecks = [
            "visual-consistency",
            "content-visibility",
            "layer-organization",
            "layout-integrity",
            "accessibility"
        ];
        const checksToRun = args.checks && args.checks.length > 0 ? args.checks : allChecks;

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

            const checksToRun = ${JSON.stringify(checksToRun)};
            const results = {
                target: { id: targetShape.id, name: targetShape.name, type: targetShape.type },
                checks: {},
                summary: { total: 0, critical: 0, warning: 0, info: 0 }
            };

            // Spacing scale for validation
            const spacingScale = [4, 8, 12, 16, 24, 32];
            const badNamePatterns = [
                /^(Rectangle|Frame|Group|Ellipse|Path|Board|Component)\\s*\\d*$/i,
                /^Component\\s*\\d+$/i
            ];

            // Helper to find nearest spacing value
            const findNearestSpacing = (value) => {
                return spacingScale.reduce((prev, curr) => 
                    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
                );
            };

            // VISUAL CONSISTENCY CHECKS
            if (checksToRun.includes("visual-consistency")) {
                const issues = [];
                
                // Group shapes by type for consistency checking
                const shapesByType = {};
                penpotUtils.findShapes(() => true, targetShape).forEach(shape => {
                    if (!shapesByType[shape.type]) {
                        shapesByType[shape.type] = [];
                    }
                    shapesByType[shape.type].push(shape);
                });

                // Check for inconsistent dimensions among similar elements
                Object.entries(shapesByType).forEach(([type, shapes]) => {
                    if (shapes.length > 1) {
                        const dimensions = shapes.map(s => ({ w: s.width, h: s.height, name: s.name }));
                        const uniqueDimensions = [...new Set(dimensions.map(d => \`\${d.w}x\${d.h}\`))];
                        
                        if (uniqueDimensions.length > 1 && type !== 'text') {
                            issues.push({
                                severity: "warning",
                                category: "inconsistent-dimensions",
                                message: \`Found \${shapes.length} \${type} shapes with \${uniqueDimensions.length} different sizes\`,
                                details: uniqueDimensions.slice(0, 5)
                            });
                        }
                    }
                });

                // Check for raw hex colors (should use tokens)
                const shapesWithRawColors = penpotUtils.findShapes(shape => {
                    if ('fills' in shape && shape.fills) {
                        return shape.fills.some(fill => 
                            fill.fillColor && fill.fillColor.startsWith('#')
                        );
                    }
                    return false;
                }, targetShape);

                if (shapesWithRawColors.length > 0) {
                    issues.push({
                        severity: "info",
                        category: "raw-hex-colors",
                        message: \`Found \${shapesWithRawColors.length} shapes using raw hex colors instead of design tokens\`,
                        shapes: shapesWithRawColors.slice(0, 5).map(s => s.name)
                    });
                }

                results.checks["visual-consistency"] = {
                    passed: issues.length === 0,
                    issueCount: issues.length,
                    issues
                };
                issues.forEach(i => results.summary[i.severity]++);
                results.summary.total += issues.length;
            }

            // CONTENT VISIBILITY CHECKS
            if (checksToRun.includes("content-visibility")) {
                const issues = [];

                // Check for clipping (elements outside parent bounds)
                const clippingIssues = penpotUtils.analyzeDescendants(targetShape, (root, shape) => {
                    if (shape.parent && !penpotUtils.isContainedIn(shape, shape.parent)) {
                        return {
                            shapeName: shape.name,
                            shapeId: shape.id,
                            parentName: shape.parent.name,
                            overflow: {
                                left: Math.max(0, shape.parent.x - shape.x),
                                top: Math.max(0, shape.parent.y - shape.y),
                                right: Math.max(0, (shape.x + shape.width) - (shape.parent.x + shape.parent.width)),
                                bottom: Math.max(0, (shape.y + shape.height) - (shape.parent.y + shape.parent.height))
                            }
                        };
                    }
                    return null;
                });

                if (clippingIssues.length > 0) {
                    issues.push({
                        severity: "critical",
                        category: "content-clipping",
                        message: \`Found \${clippingIssues.length} elements extending beyond their parent bounds\`,
                        shapes: clippingIssues.slice(0, 10).map(c => ({
                            name: c.result.shapeName,
                            id: c.result.shapeId,
                            parent: c.result.parentName,
                            overflow: c.result.overflow
                        }))
                    });
                }

                // Check for text elements (common source of clipping)
                const textShapes = penpotUtils.findShapes(s => s.type === 'text', targetShape);
                const clippedText = textShapes.filter(text => 
                    text.parent && !penpotUtils.isContainedIn(text, text.parent)
                );

                if (clippedText.length > 0) {
                    issues.push({
                        severity: "critical",
                        category: "text-clipping",
                        message: \`Found \${clippedText.length} text elements that may be clipped\`,
                        shapes: clippedText.slice(0, 5).map(t => t.name)
                    });
                }

                results.checks["content-visibility"] = {
                    passed: issues.length === 0,
                    issueCount: issues.length,
                    issues
                };
                issues.forEach(i => results.summary[i.severity]++);
                results.summary.total += issues.length;
            }

            // LAYER ORGANIZATION CHECKS
            if (checksToRun.includes("layer-organization")) {
                const issues = [];

                // Check for badly named layers
                const badlyNamed = penpotUtils.analyzeDescendants(targetShape, (root, shape) => {
                    for (const pattern of badNamePatterns) {
                        if (pattern.test(shape.name)) {
                            return { name: shape.name, id: shape.id, type: shape.type };
                        }
                    }
                    return null;
                });

                if (badlyNamed.length > 0) {
                    issues.push({
                        severity: "warning",
                        category: "poor-naming",
                        message: \`Found \${badlyNamed.length} layers with generic names (e.g., "Rectangle 47")\`,
                        shapes: badlyNamed.slice(0, 10).map(b => ({ name: b.result.name, type: b.result.type }))
                    });
                }

                // Check hierarchy depth (max recommended: 4-5 levels)
                let maxDepth = 0;
                let deepestPath = [];
                const checkDepth = (shape, depth = 0, path = []) => {
                    if (depth > maxDepth) {
                        maxDepth = depth;
                        deepestPath = [...path, shape.name];
                    }
                    if ('children' in shape && shape.children) {
                        shape.children.forEach(child => 
                            checkDepth(child, depth + 1, [...path, shape.name])
                        );
                    }
                };
                checkDepth(targetShape);

                if (maxDepth > 5) {
                    issues.push({
                        severity: "warning",
                        category: "deep-nesting",
                        message: \`Maximum nesting depth is \${maxDepth} levels (recommended: 4-5)\`,
                        deepestPath: deepestPath.slice(-6)
                    });
                }

                results.checks["layer-organization"] = {
                    passed: issues.length === 0,
                    issueCount: issues.length,
                    maxDepth,
                    issues
                };
                issues.forEach(i => results.summary[i.severity]++);
                results.summary.total += issues.length;
            }

            // LAYOUT INTEGRITY CHECKS
            if (checksToRun.includes("layout-integrity")) {
                const issues = [];

                // Check boards without layout systems
                const boardsWithoutLayout = penpotUtils.findShapes(shape => 
                    shape.type === 'board' && !shape.flex && !shape.grid,
                    targetShape
                );

                if (boardsWithoutLayout.length > 0) {
                    issues.push({
                        severity: "warning",
                        category: "missing-layout",
                        message: \`Found \${boardsWithoutLayout.length} boards without flex or grid layout\`,
                        shapes: boardsWithoutLayout.slice(0, 5).map(b => b.name)
                    });
                }

                // Check for non-standard spacing in flex layouts
                const flexContainers = penpotUtils.findShapes(shape => 
                    shape.type === 'board' && shape.flex,
                    targetShape
                );

                const nonStandardSpacing = [];
                flexContainers.forEach(board => {
                    const gaps = [];
                    if (board.flex.rowGap && !spacingScale.includes(board.flex.rowGap)) {
                        const nearest = findNearestSpacing(board.flex.rowGap);
                        gaps.push({
                            type: 'rowGap',
                            current: board.flex.rowGap,
                            suggested: nearest
                        });
                    }
                    if (board.flex.columnGap && !spacingScale.includes(board.flex.columnGap)) {
                        const nearest = findNearestSpacing(board.flex.columnGap);
                        gaps.push({
                            type: 'columnGap',
                            current: board.flex.columnGap,
                            suggested: nearest
                        });
                    }
                    if (gaps.length > 0) {
                        nonStandardSpacing.push({
                            name: board.name,
                            id: board.id,
                            gaps
                        });
                    }
                });

                if (nonStandardSpacing.length > 0) {
                    issues.push({
                        severity: "info",
                        category: "non-standard-spacing",
                        message: \`Found \${nonStandardSpacing.length} containers with non-standard spacing values\`,
                        containers: nonStandardSpacing.slice(0, 5)
                    });
                }

                results.checks["layout-integrity"] = {
                    passed: issues.length === 0,
                    issueCount: issues.length,
                    issues
                };
                issues.forEach(i => results.summary[i.severity]++);
                results.summary.total += issues.length;
            }

            // ACCESSIBILITY CHECKS
            if (checksToRun.includes("accessibility")) {
                const issues = [];

                // Check minimum text size (12px)
                const smallText = penpotUtils.findShapes(shape => {
                    if (shape.type === 'text' && 'fontSize' in shape) {
                        const size = parseInt(shape.fontSize);
                        return !isNaN(size) && size < 12;
                    }
                    return false;
                }, targetShape);

                if (smallText.length > 0) {
                    issues.push({
                        severity: "warning",
                        category: "small-text",
                        message: \`Found \${smallText.length} text elements smaller than 12px (accessibility minimum)\`,
                        shapes: smallText.slice(0, 5).map(t => ({
                            name: t.name,
                            fontSize: t.fontSize
                        }))
                    });
                }

                // Check interactive element size (minimum 44px)
                const buttons = penpotUtils.findShapes(shape => 
                    shape.name.toLowerCase().includes('button') ||
                    shape.name.toLowerCase().includes('btn'),
                    targetShape
                );

                const smallButtons = buttons.filter(b => b.width < 44 || b.height < 44);
                if (smallButtons.length > 0) {
                    issues.push({
                        severity: "warning",
                        category: "small-interactive",
                        message: \`Found \${smallButtons.length} button-like elements smaller than 44x44px (touch target minimum)\`,
                        shapes: smallButtons.slice(0, 5).map(b => ({
                            name: b.name,
                            size: \`\${Math.round(b.width)}x\${Math.round(b.height)}\`
                        }))
                    });
                }

                results.checks["accessibility"] = {
                    passed: issues.length === 0,
                    issueCount: issues.length,
                    issues
                };
                issues.forEach(i => results.summary[i.severity]++);
                results.summary.total += issues.length;
            }

            return results;
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Validation failed: ${result.error}`);
        }

        // Format the results
        let output = `# Design Validation Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n\n`;
        output += `## Summary\n`;
        output += `- Total Issues: ${result.summary.total}\n`;
        output += `- Critical: ${result.summary.critical}\n`;
        output += `- Warnings: ${result.summary.warning}\n`;
        output += `- Info: ${result.summary.info}\n\n`;

        if (result.summary.total === 0) {
            output += `✅ **All checks passed!** No issues found.\n`;
        } else {
            output += `## Issues by Category\n\n`;
            Object.entries(result.checks).forEach(([category, data]: [string, any]) => {
                const icon = data.passed ? '✅' : '⚠️';
                output += `### ${icon} ${category.replace(/-/g, ' ').toUpperCase()}\n`;
                output += `- Status: ${data.passed ? 'PASSED' : 'FAILED'}\n`;
                output += `- Issues: ${data.issueCount}\n`;
                
                if (data.maxDepth !== undefined) {
                    output += `- Max Nesting Depth: ${data.maxDepth}\n`;
                }
                
                if (data.issues && data.issues.length > 0) {
                    output += `\n**Details:**\n`;
                    data.issues.forEach((issue: any) => {
                        output += `\n- **[${issue.severity.toUpperCase()}]** ${issue.message}\n`;
                        if (issue.shapes) {
                            output += `  Affected shapes: ${JSON.stringify(issue.shapes, null, 2)}\n`;
                        }
                        if (issue.containers) {
                            output += `  Containers: ${JSON.stringify(issue.containers, null, 2)}\n`;
                        }
                        if (issue.details) {
                            output += `  Details: ${JSON.stringify(issue.details, null, 2)}\n`;
                        }
                        if (issue.deepestPath) {
                            output += `  Path: ${issue.deepestPath.join(' > ')}\n`;
                        }
                    });
                }
                output += `\n`;
            });
        }

        return new TextResponse(output);
    }
}
