import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Generates a component specification document from a Penpot design.
 * Creates developer handoff documentation with structure, states, and styling details.
 */
export class GenerateComponentSpecTool extends Tool<{
    target: string;
    includeStates?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target component to generate spec for: "selection" for current selection, or a shape ID'
            ),
            includeStates: z.boolean().optional().describe(
                'If true, attempt to detect and document component states (hover, active, disabled). Default: true'
            ),
        });
    }

    getToolName(): string {
        return "generate_component_spec";
    }

    getToolDescription(): string {
        return (
            "Generates a component specification document from a Penpot design. " +
            "Creates developer handoff documentation including component structure, " +
            "styling details, states, and implementation notes. Perfect for design-to-code handoff."
        );
    }

    protected async executeCore(args: {
        target: string;
        includeStates?: boolean;
    }): Promise<ToolResponse> {
        const includeStates = args.includeStates ?? true;

        const code = `
            // Get target shape
            let targetShape;
            if (${JSON.stringify(args.target)} === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a component." };
                }
                targetShape = penpot.selection[0];
            } else {
                targetShape = penpotUtils.findShapeById(${JSON.stringify(args.target)});
                if (!targetShape) {
                    return { error: "Shape with ID " + ${JSON.stringify(args.target)} + " not found." };
                }
            }

            const includeStates = ${includeStates};

            /**
             * Build component structure tree
             */
            const buildStructure = (shape, depth = 0) => {
                const node = {
                    name: shape.name,
                    type: shape.type,
                    depth: depth,
                    layout: null,
                    dimensions: {
                        width: Math.round(shape.width),
                        height: Math.round(shape.height)
                    }
                };

                // Layout info
                if ('flex' in shape && shape.flex) {
                    node.layout = {
                        type: 'flex',
                        direction: shape.flex.dir,
                        gap: shape.flex.dir === 'row' ? shape.flex.columnGap : shape.flex.rowGap,
                        align: shape.flex.alignItems,
                        justify: shape.flex.justifyContent
                    };
                } else if ('grid' in shape && shape.grid) {
                    node.layout = {
                        type: 'grid',
                        rows: shape.grid.rows?.length || 0,
                        columns: shape.grid.columns?.length || 0
                    };
                }

                // Children
                if ('children' in shape && shape.children) {
                    node.children = shape.children.map(child => buildStructure(child, depth + 1));
                }

                return node;
            };

            /**
             * Extract unique colors used
             */
            const extractColors = (shape, colors = new Set()) => {
                if ('fills' in shape && shape.fills) {
                    shape.fills.forEach(fill => {
                        if (fill.fillColor) colors.add(fill.fillColor);
                    });
                }
                if ('strokes' in shape && shape.strokes) {
                    shape.strokes.forEach(stroke => {
                        if (stroke.strokeColor) colors.add(stroke.strokeColor);
                    });
                }
                if ('children' in shape && shape.children) {
                    shape.children.forEach(child => extractColors(child, colors));
                }
                return colors;
            };

            /**
             * Extract unique typography styles
             */
            const extractTypography = (shape, styles = []) => {
                if (shape.type === 'text') {
                    const style = {
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        fontWeight: shape.fontWeight,
                        lineHeight: shape.lineHeight,
                        color: shape.fills?.[0]?.fillColor
                    };
                    
                    // Check if this style already exists
                    const exists = styles.some(s => 
                        s.fontFamily === style.fontFamily &&
                        s.fontSize === style.fontSize &&
                        s.fontWeight === style.fontWeight
                    );
                    
                    if (!exists) {
                        styles.push(style);
                    }
                }
                if ('children' in shape && shape.children) {
                    shape.children.forEach(child => extractTypography(child, styles));
                }
                return styles;
            };

            /**
             * Detect potential states by analyzing similar named elements
             */
            const detectStates = (shape) => {
                const states = [];
                const name = shape.name.toLowerCase();
                
                // Common state patterns
                const statePatterns = [
                    { pattern: /default|normal|rest/, state: 'default' },
                    { pattern: /hover|hovered/, state: 'hover' },
                    { pattern: /active|pressed|clicking/, state: 'active' },
                    { pattern: /focus|focused/, state: 'focus' },
                    { pattern: /disabled|inactive/, state: 'disabled' },
                    { pattern: /completed|done|success/, state: 'completed' },
                    { pattern: /current|active|selected/, state: 'current' },
                    { pattern: /upcoming|pending|future/, state: 'upcoming' },
                    { pattern: /error|invalid/, state: 'error' }
                ];

                // Check the shape name
                statePatterns.forEach(({ pattern, state }) => {
                    if (pattern.test(name)) {
                        states.push(state);
                    }
                });

                // Check children for state indicators
                if ('children' in shape && shape.children) {
                    shape.children.forEach(child => {
                        const childName = child.name.toLowerCase();
                        statePatterns.forEach(({ pattern, state }) => {
                            if (pattern.test(childName) && !states.includes(state)) {
                                states.push(state);
                            }
                        });
                    });
                }

                return states;
            };

            /**
             * Extract key styling details
             */
            const extractStyling = (shape) => {
                const styling = {
                    name: shape.name,
                    type: shape.type,
                    dimensions: {
                        width: Math.round(shape.width),
                        height: Math.round(shape.height)
                    }
                };

                // Background
                if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                    const fill = shape.fills[0];
                    if (fill.fillColor) {
                        styling.background = fill.fillColor;
                    }
                }

                // Border
                if ('strokes' in shape && shape.strokes && shape.strokes.length > 0) {
                    const stroke = shape.strokes[0];
                    styling.border = {
                        width: stroke.strokeWidth,
                        color: stroke.strokeColor,
                        style: stroke.strokeStyle || 'solid'
                    };
                }

                // Border radius
                if ('borderRadius' in shape && shape.borderRadius) {
                    styling.borderRadius = shape.borderRadius;
                }

                // Typography
                if (shape.type === 'text') {
                    styling.typography = {
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        fontWeight: shape.fontWeight,
                        lineHeight: shape.lineHeight,
                        color: shape.fills?.[0]?.fillColor
                    };
                    styling.text = shape.characters;
                }

                // Layout
                if ('flex' in shape && shape.flex) {
                    styling.layout = {
                        type: 'flex',
                        direction: shape.flex.dir,
                        alignItems: shape.flex.alignItems,
                        justifyContent: shape.flex.justifyContent,
                        rowGap: shape.flex.rowGap,
                        columnGap: shape.flex.columnGap,
                        padding: {
                            top: shape.flex.topPadding || shape.flex.verticalPadding || 0,
                            right: shape.flex.rightPadding || shape.flex.horizontalPadding || 0,
                            bottom: shape.flex.bottomPadding || shape.flex.verticalPadding || 0,
                            left: shape.flex.leftPadding || shape.flex.horizontalPadding || 0
                        }
                    };
                }

                // Child styling
                if ('children' in shape && shape.children) {
                    styling.children = shape.children.map(extractStyling);
                }

                return styling;
            };

            // Build the spec
            const structure = buildStructure(targetShape);
            const colors = [...extractColors(targetShape)];
            const typography = extractTypography(targetShape);
            const styling = extractStyling(targetShape);
            const states = includeStates ? detectStates(targetShape) : [];

            return {
                component: {
                    name: targetShape.name,
                    type: targetShape.type,
                    dimensions: {
                        width: Math.round(targetShape.width),
                        height: Math.round(targetShape.height)
                    }
                },
                structure: structure,
                colors: colors,
                typography: typography,
                styling: styling,
                states: states
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Spec generation failed: ${result.error}`);
        }

        // Generate markdown documentation
        let output = `# Component Specification: ${result.component.name}\n\n`;
        output += `**Type:** ${result.component.type}\n`;
        output += `**Dimensions:** ${result.component.dimensions.width} × ${result.component.dimensions.height}px\n\n`;

        // Structure
        output += `---\n\n## Component Structure\n\n`;
        output += `\`\`\`\n`;
        output += this.formatStructure(result.structure);
        output += `\`\`\`\n\n`;

        // States
        if (result.states.length > 0) {
            output += `## States\n\n`;
            output += `This component appears to have the following states:\n\n`;
            result.states.forEach((state: string) => {
                output += `- **${state.charAt(0).toUpperCase() + state.slice(1)}**\n`;
            });
            output += `\n`;
        }

        // Color Palette
        output += `## Color Palette\n\n`;
        output += `| Color | Hex |\n`;
        output += `|-------|-----|\n`;
        result.colors.forEach((color: string) => {
            output += `| ![${color}](https://via.placeholder.com/20/${color.replace('#', '')}/${color.replace('#', '')}) | \`${color}\` |\n`;
        });
        output += `\n`;

        // Typography
        if (result.typography.length > 0) {
            output += `## Typography\n\n`;
            output += `| Element | Font | Size | Weight | Color |\n`;
            output += `|---------|------|------|--------|-------|\n`;
            result.typography.forEach((t: any, i: number) => {
                output += `| Text ${i + 1} | ${t.fontFamily || 'inherit'} | ${t.fontSize || '-'}px | ${t.fontWeight || '-'} | \`${t.color || '-'}\` |\n`;
            });
            output += `\n`;
        }

        // Styling Details
        output += `## Detailed Styling\n\n`;
        output += this.formatStyling(result.styling);

        // Implementation Notes
        output += `## Implementation Notes\n\n`;
        output += `### Layout System\n\n`;
        if (result.styling.layout) {
            output += `- Use **${result.styling.layout.type}** layout\n`;
            output += `- Direction: **${result.styling.layout.direction}**\n`;
            if (result.styling.layout.alignItems) {
                output += `- Align items: **${result.styling.layout.alignItems}**\n`;
            }
            if (result.styling.layout.justifyContent) {
                output += `- Justify content: **${result.styling.layout.justifyContent}**\n`;
            }
            if (result.styling.layout.rowGap) {
                output += `- Row gap: **${result.styling.layout.rowGap}px**\n`;
            }
            if (result.styling.layout.columnGap) {
                output += `- Column gap: **${result.styling.layout.columnGap}px**\n`;
            }
        } else {
            output += `- No flex/grid layout detected - may use absolute positioning\n`;
        }
        output += `\n`;

        output += `### Recommendations\n\n`;
        output += `1. Use CSS custom properties for colors to support theming\n`;
        output += `2. Implement all detected states with appropriate transitions\n`;
        output += `3. Ensure responsive behavior by testing at different widths\n`;
        output += `4. Add appropriate ARIA attributes for accessibility\n`;

        return new TextResponse(output);
    }

    private formatStructure(node: any, indent: string = ""): string {
        let output = "";
        const prefix = indent === "" ? "" : indent.slice(0, -4) + "├── ";
        
        let info = `${node.name} (${node.type})`;
        if (node.layout) {
            info += ` [${node.layout.type} ${node.layout.direction}`;
            if (node.layout.gap) info += `, gap: ${node.layout.gap}px`;
            info += `]`;
        }
        info += ` ${node.dimensions.width}×${node.dimensions.height}`;
        
        output += prefix + info + "\n";
        
        if (node.children) {
            node.children.forEach((child: any, i: number) => {
                const isLast = i === node.children.length - 1;
                const nextIndent = indent + (isLast ? "    " : "│   ");
                output += this.formatStructure(child, nextIndent);
            });
        }
        
        return output;
    }

    private formatStyling(styling: any, depth: number = 0): string {
        const indent = "  ".repeat(depth);
        let output = "";

        output += `${indent}### ${styling.name}\n\n`;
        output += `${indent}- **Type:** ${styling.type}\n`;
        output += `${indent}- **Size:** ${styling.dimensions.width} × ${styling.dimensions.height}px\n`;
        
        if (styling.background) {
            output += `${indent}- **Background:** \`${styling.background}\`\n`;
        }
        
        if (styling.border) {
            output += `${indent}- **Border:** ${styling.border.width}px ${styling.border.style} \`${styling.border.color}\`\n`;
        }
        
        if (styling.borderRadius) {
            output += `${indent}- **Border Radius:** ${styling.borderRadius}px\n`;
        }
        
        if (styling.typography) {
            output += `${indent}- **Font:** ${styling.typography.fontFamily} ${styling.typography.fontSize}px (${styling.typography.fontWeight})\n`;
            if (styling.typography.color) {
                output += `${indent}- **Color:** \`${styling.typography.color}\`\n`;
            }
        }
        
        if (styling.layout) {
            output += `${indent}- **Layout:** ${styling.layout.type} ${styling.layout.direction}\n`;
            if (styling.layout.padding) {
                const p = styling.layout.padding;
                output += `${indent}- **Padding:** ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px\n`;
            }
        }

        if (styling.text) {
            output += `${indent}- **Text:** "${styling.text}"\n`;
        }
        
        output += `\n`;
        
        if (styling.children && styling.children.length > 0 && depth < 2) {
            styling.children.forEach((child: any) => {
                output += this.formatStyling(child, depth + 1);
            });
        }
        
        return output;
    }
}
