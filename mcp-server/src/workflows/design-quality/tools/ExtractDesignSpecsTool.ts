import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Extracts detailed design specifications from a shape including dimensions,
 * colors, typography, spacing, and layout settings. Useful for design-to-code handoff.
 */
export class ExtractDesignSpecsTool extends Tool<{
    target: string;
    format?: string;
    includeChildren?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target shape to extract specs from: "selection" for current selection, or a shape ID'
            ),
            format: z.enum(["json", "css", "markdown"]).optional().describe(
                'Output format: "json" (structured data), "css" (CSS properties), "markdown" (documentation). Default: "json"'
            ),
            includeChildren: z.boolean().optional().describe(
                'If true, include specs for all child elements. Default: true'
            ),
        });
    }

    getToolName(): string {
        return "extract_design_specs";
    }

    getToolDescription(): string {
        return (
            "Extracts detailed design specifications from a shape including dimensions, colors, " +
            "typography, spacing, and layout settings. Outputs in JSON, CSS, or Markdown format. " +
            "Essential for design-to-code handoff and ensuring implementation matches design."
        );
    }

    protected async executeCore(args: {
        target: string;
        format?: string;
        includeChildren?: boolean;
    }): Promise<ToolResponse> {
        const format = args.format || "json";
        const includeChildren = args.includeChildren ?? true;

        const code = `
            // Get target shape
            let targetShape;
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a shape." };
                }
                targetShape = penpot.selection[0];
            } else {
                targetShape = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!targetShape) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
            }

            const includeChildren = ${includeChildren};

            /**
             * Extract color from fill
             */
            const extractColor = (fill) => {
                if (!fill) return null;
                if (fill.fillColor) {
                    return {
                        type: 'solid',
                        color: fill.fillColor,
                        opacity: fill.fillOpacity ?? 1
                    };
                }
                if (fill.fillImage) {
                    return {
                        type: 'image',
                        width: fill.fillImage.width,
                        height: fill.fillImage.height
                    };
                }
                return null;
            };

            /**
             * Extract stroke info
             */
            const extractStroke = (stroke) => {
                if (!stroke) return null;
                return {
                    color: stroke.strokeColor,
                    width: stroke.strokeWidth,
                    opacity: stroke.strokeOpacity ?? 1,
                    style: stroke.strokeStyle || 'solid',
                    alignment: stroke.strokeAlignment || 'center'
                };
            };

            /**
             * Extract specs from a single shape
             */
            const extractShapeSpecs = (shape) => {
                const specs = {
                    id: shape.id,
                    name: shape.name,
                    type: shape.type,
                    
                    // Dimensions
                    dimensions: {
                        x: Math.round(shape.x),
                        y: Math.round(shape.y),
                        width: Math.round(shape.width),
                        height: Math.round(shape.height)
                    },
                    
                    // Position relative to parent
                    position: shape.parent ? {
                        parentX: Math.round(shape.x - shape.parent.x),
                        parentY: Math.round(shape.y - shape.parent.y)
                    } : null
                };

                // Fills
                if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                    specs.fills = shape.fills.map(extractColor).filter(Boolean);
                }

                // Strokes
                if ('strokes' in shape && shape.strokes && shape.strokes.length > 0) {
                    specs.strokes = shape.strokes.map(extractStroke).filter(Boolean);
                }

                // Border radius
                if ('borderRadius' in shape && shape.borderRadius) {
                    specs.borderRadius = shape.borderRadius;
                }
                if ('borderRadiusTopLeft' in shape) {
                    specs.borderRadii = {
                        topLeft: shape.borderRadiusTopLeft,
                        topRight: shape.borderRadiusTopRight,
                        bottomRight: shape.borderRadiusBottomRight,
                        bottomLeft: shape.borderRadiusBottomLeft
                    };
                }

                // Typography (for text)
                if (shape.type === 'text') {
                    specs.typography = {
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        fontWeight: shape.fontWeight,
                        fontStyle: shape.fontStyle,
                        lineHeight: shape.lineHeight,
                        letterSpacing: shape.letterSpacing,
                        textAlign: shape.textAlign,
                        textDecoration: shape.textDecoration
                    };
                    
                    // Text content
                    if ('characters' in shape) {
                        specs.text = shape.characters;
                    }
                }

                // Flex layout
                if ('flex' in shape && shape.flex) {
                    specs.layout = {
                        type: 'flex',
                        direction: shape.flex.dir,
                        alignItems: shape.flex.alignItems,
                        alignContent: shape.flex.alignContent,
                        justifyItems: shape.flex.justifyItems,
                        justifyContent: shape.flex.justifyContent,
                        rowGap: shape.flex.rowGap,
                        columnGap: shape.flex.columnGap,
                        padding: {
                            top: shape.flex.topPadding || shape.flex.verticalPadding || 0,
                            right: shape.flex.rightPadding || shape.flex.horizontalPadding || 0,
                            bottom: shape.flex.bottomPadding || shape.flex.verticalPadding || 0,
                            left: shape.flex.leftPadding || shape.flex.horizontalPadding || 0
                        },
                        wrap: shape.flex.wrap
                    };
                }

                // Grid layout
                if ('grid' in shape && shape.grid) {
                    specs.layout = {
                        type: 'grid',
                        rows: shape.grid.rows?.length || 0,
                        columns: shape.grid.columns?.length || 0,
                        rowGap: shape.grid.rowGap,
                        columnGap: shape.grid.columnGap
                    };
                }

                // Opacity
                if ('opacity' in shape && shape.opacity !== undefined && shape.opacity !== 1) {
                    specs.opacity = shape.opacity;
                }

                // Shadow
                if ('shadow' in shape && shape.shadow) {
                    specs.shadow = shape.shadow;
                }

                // Blur
                if ('blur' in shape && shape.blur) {
                    specs.blur = shape.blur;
                }

                return specs;
            };

            /**
             * Extract specs recursively
             */
            const extractAllSpecs = (shape, depth = 0) => {
                const specs = extractShapeSpecs(shape);
                specs.depth = depth;
                
                if (includeChildren && 'children' in shape && shape.children && shape.children.length > 0) {
                    specs.children = shape.children.map(child => extractAllSpecs(child, depth + 1));
                }
                
                return specs;
            };

            return {
                specs: extractAllSpecs(targetShape),
                format: ${JSON.stringify(format)}
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Extraction failed: ${result.error}`);
        }

        const specs = result.specs;

        // Format output based on requested format
        if (format === "json") {
            return new TextResponse(
                `# Design Specifications\n\n` +
                `**Component:** ${specs.name}\n` +
                `**Type:** ${specs.type}\n\n` +
                `\`\`\`json\n${JSON.stringify(specs, null, 2)}\n\`\`\``
            );
        } else if (format === "css") {
            const cssOutput = this.generateCss(specs);
            return new TextResponse(
                `# CSS Properties\n\n` +
                `**Component:** ${specs.name}\n\n` +
                `\`\`\`css\n${cssOutput}\n\`\`\``
            );
        } else if (format === "markdown") {
            const mdOutput = this.generateMarkdown(specs);
            return new TextResponse(mdOutput);
        }

        return new TextResponse(JSON.stringify(specs, null, 2));
    }

    private generateCss(specs: any, prefix: string = ""): string {
        const lines: string[] = [];
        const name = specs.name.toLowerCase().replace(/\s+/g, '-');
        const fullPrefix = prefix ? `${prefix}-${name}` : name;

        // Dimensions
        lines.push(`/* ${specs.name} */`);
        lines.push(`.${fullPrefix} {`);
        lines.push(`  width: ${specs.dimensions.width}px;`);
        lines.push(`  height: ${specs.dimensions.height}px;`);

        // Background
        if (specs.fills && specs.fills.length > 0) {
            const fill = specs.fills[0];
            if (fill.type === 'solid') {
                lines.push(`  background-color: ${fill.color};`);
                if (fill.opacity < 1) {
                    lines.push(`  opacity: ${fill.opacity};`);
                }
            }
        }

        // Border
        if (specs.strokes && specs.strokes.length > 0) {
            const stroke = specs.strokes[0];
            lines.push(`  border: ${stroke.width}px ${stroke.style} ${stroke.color};`);
        }

        // Border radius
        if (specs.borderRadius) {
            lines.push(`  border-radius: ${specs.borderRadius}px;`);
        } else if (specs.borderRadii) {
            const r = specs.borderRadii;
            lines.push(`  border-radius: ${r.topLeft}px ${r.topRight}px ${r.bottomRight}px ${r.bottomLeft}px;`);
        }

        // Typography
        if (specs.typography) {
            const t = specs.typography;
            if (t.fontFamily) lines.push(`  font-family: ${t.fontFamily};`);
            if (t.fontSize) lines.push(`  font-size: ${t.fontSize}px;`);
            if (t.fontWeight) lines.push(`  font-weight: ${t.fontWeight};`);
            if (t.lineHeight) lines.push(`  line-height: ${t.lineHeight};`);
            if (t.letterSpacing) lines.push(`  letter-spacing: ${t.letterSpacing}px;`);
            if (t.textAlign) lines.push(`  text-align: ${t.textAlign};`);
        }

        // Layout
        if (specs.layout) {
            if (specs.layout.type === 'flex') {
                lines.push(`  display: flex;`);
                lines.push(`  flex-direction: ${specs.layout.direction};`);
                if (specs.layout.alignItems) lines.push(`  align-items: ${specs.layout.alignItems};`);
                if (specs.layout.justifyContent) lines.push(`  justify-content: ${specs.layout.justifyContent};`);
                if (specs.layout.rowGap) lines.push(`  row-gap: ${specs.layout.rowGap}px;`);
                if (specs.layout.columnGap) lines.push(`  column-gap: ${specs.layout.columnGap}px;`);
                if (specs.layout.padding) {
                    const p = specs.layout.padding;
                    lines.push(`  padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`);
                }
            }
        }

        lines.push(`}`);
        lines.push(``);

        // Recursively add children
        if (specs.children) {
            specs.children.forEach((child: any) => {
                lines.push(this.generateCss(child, fullPrefix));
            });
        }

        return lines.join('\n');
    }

    private generateMarkdown(specs: any, depth: number = 0): string {
        const lines: string[] = [];
        const indent = '  '.repeat(depth);
        const heading = '#'.repeat(Math.min(depth + 1, 6));

        if (depth === 0) {
            lines.push(`# Design Specification: ${specs.name}\n`);
            lines.push(`**Type:** ${specs.type}\n`);
        } else {
            lines.push(`${heading} ${specs.name} (${specs.type})\n`);
        }

        // Dimensions
        lines.push(`**Dimensions:** ${specs.dimensions.width} × ${specs.dimensions.height}px\n`);
        if (specs.position) {
            lines.push(`**Position (relative to parent):** (${specs.position.parentX}, ${specs.position.parentY})\n`);
        }

        // Fills
        if (specs.fills && specs.fills.length > 0) {
            lines.push(`**Fills:**`);
            specs.fills.forEach((fill: any) => {
                if (fill.type === 'solid') {
                    lines.push(`- Solid: \`${fill.color}\` (opacity: ${fill.opacity})`);
                } else if (fill.type === 'image') {
                    lines.push(`- Image: ${fill.width}×${fill.height}px`);
                }
            });
            lines.push(``);
        }

        // Strokes
        if (specs.strokes && specs.strokes.length > 0) {
            lines.push(`**Strokes:**`);
            specs.strokes.forEach((stroke: any) => {
                lines.push(`- ${stroke.width}px ${stroke.style} \`${stroke.color}\``);
            });
            lines.push(``);
        }

        // Typography
        if (specs.typography) {
            const t = specs.typography;
            lines.push(`**Typography:**`);
            lines.push(`| Property | Value |`);
            lines.push(`|----------|-------|`);
            if (t.fontFamily) lines.push(`| Font Family | ${t.fontFamily} |`);
            if (t.fontSize) lines.push(`| Font Size | ${t.fontSize}px |`);
            if (t.fontWeight) lines.push(`| Font Weight | ${t.fontWeight} |`);
            if (t.lineHeight) lines.push(`| Line Height | ${t.lineHeight} |`);
            if (t.letterSpacing) lines.push(`| Letter Spacing | ${t.letterSpacing}px |`);
            if (t.textAlign) lines.push(`| Text Align | ${t.textAlign} |`);
            lines.push(``);
            
            if (specs.text) {
                lines.push(`**Content:** "${specs.text}"\n`);
            }
        }

        // Layout
        if (specs.layout) {
            lines.push(`**Layout:** ${specs.layout.type.toUpperCase()}`);
            if (specs.layout.type === 'flex') {
                lines.push(`| Property | Value |`);
                lines.push(`|----------|-------|`);
                lines.push(`| Direction | ${specs.layout.direction} |`);
                if (specs.layout.alignItems) lines.push(`| Align Items | ${specs.layout.alignItems} |`);
                if (specs.layout.justifyContent) lines.push(`| Justify Content | ${specs.layout.justifyContent} |`);
                if (specs.layout.rowGap) lines.push(`| Row Gap | ${specs.layout.rowGap}px |`);
                if (specs.layout.columnGap) lines.push(`| Column Gap | ${specs.layout.columnGap}px |`);
                if (specs.layout.padding) {
                    const p = specs.layout.padding;
                    lines.push(`| Padding | ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px |`);
                }
            }
            lines.push(``);
        }

        // Border radius
        if (specs.borderRadius) {
            lines.push(`**Border Radius:** ${specs.borderRadius}px\n`);
        }

        lines.push(`---\n`);

        // Children
        if (specs.children && specs.children.length > 0) {
            specs.children.forEach((child: any) => {
                lines.push(this.generateMarkdown(child, depth + 1));
            });
        }

        return lines.join('\n');
    }
}
