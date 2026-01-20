import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Generates CSS custom properties (variables) from a Penpot design.
 * Extracts colors, dimensions, spacing, and typography into reusable CSS variables.
 */
export class GenerateCssVariablesTool extends Tool<{
    target: string;
    prefix?: string;
    includeChildren?: boolean;
    groupBy?: string;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target shape to generate variables from: "selection" for current selection, or a shape ID'
            ),
            prefix: z.string().optional().describe(
                'Prefix for CSS variable names (e.g., "stepper" → --stepper-*). Default: component name'
            ),
            includeChildren: z.boolean().optional().describe(
                'If true, include variables for all child elements. Default: true'
            ),
            groupBy: z.enum(["element", "property", "flat"]).optional().describe(
                'How to organize variables: "element" (by component), "property" (by type), "flat" (no grouping). Default: "element"'
            ),
        });
    }

    getToolName(): string {
        return "generate_css_variables";
    }

    getToolDescription(): string {
        return (
            "Generates CSS custom properties (variables) from a Penpot design. " +
            "Extracts colors, dimensions, spacing, and typography into reusable :root variables. " +
            "Essential for maintaining design-code consistency and creating design systems."
        );
    }

    protected async executeCore(args: {
        target: string;
        prefix?: string;
        includeChildren?: boolean;
        groupBy?: string;
    }): Promise<ToolResponse> {
        const includeChildren = args.includeChildren ?? true;
        const groupBy = args.groupBy || "element";

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
             * Convert name to CSS variable format
             */
            const toVarName = (name) => {
                return name.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            };

            /**
             * Extract variables from a shape
             */
            const extractVariables = (shape, parentPrefix = '') => {
                const vars = {
                    dimensions: [],
                    colors: [],
                    typography: [],
                    spacing: [],
                    borders: []
                };

                const name = toVarName(shape.name);
                const prefix = parentPrefix ? parentPrefix + '-' + name : name;

                // Dimensions
                vars.dimensions.push({
                    name: prefix + '-width',
                    value: Math.round(shape.width) + 'px',
                    comment: shape.name + ' width'
                });
                vars.dimensions.push({
                    name: prefix + '-height',
                    value: Math.round(shape.height) + 'px',
                    comment: shape.name + ' height'
                });

                // Fills (colors)
                if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                    shape.fills.forEach((fill, i) => {
                        if (fill.fillColor) {
                            const suffix = shape.fills.length > 1 ? '-' + (i + 1) : '';
                            vars.colors.push({
                                name: prefix + '-bg' + suffix,
                                value: fill.fillColor,
                                comment: shape.name + ' background'
                            });
                        }
                    });
                }

                // Text color (from first fill if text)
                if (shape.type === 'text' && 'fills' in shape && shape.fills && shape.fills.length > 0) {
                    const fill = shape.fills[0];
                    if (fill.fillColor) {
                        vars.colors.push({
                            name: prefix + '-color',
                            value: fill.fillColor,
                            comment: shape.name + ' text color'
                        });
                    }
                }

                // Strokes
                if ('strokes' in shape && shape.strokes && shape.strokes.length > 0) {
                    shape.strokes.forEach((stroke, i) => {
                        if (stroke.strokeColor) {
                            const suffix = shape.strokes.length > 1 ? '-' + (i + 1) : '';
                            vars.borders.push({
                                name: prefix + '-border-color' + suffix,
                                value: stroke.strokeColor,
                                comment: shape.name + ' border color'
                            });
                            vars.borders.push({
                                name: prefix + '-border-width' + suffix,
                                value: stroke.strokeWidth + 'px',
                                comment: shape.name + ' border width'
                            });
                        }
                    });
                }

                // Border radius
                if ('borderRadius' in shape && shape.borderRadius) {
                    vars.borders.push({
                        name: prefix + '-border-radius',
                        value: shape.borderRadius + 'px',
                        comment: shape.name + ' border radius'
                    });
                }

                // Typography
                if (shape.type === 'text') {
                    if (shape.fontFamily) {
                        vars.typography.push({
                            name: prefix + '-font-family',
                            value: shape.fontFamily,
                            comment: shape.name + ' font'
                        });
                    }
                    if (shape.fontSize) {
                        vars.typography.push({
                            name: prefix + '-font-size',
                            value: shape.fontSize + 'px',
                            comment: shape.name + ' size'
                        });
                    }
                    if (shape.fontWeight) {
                        vars.typography.push({
                            name: prefix + '-font-weight',
                            value: String(shape.fontWeight),
                            comment: shape.name + ' weight'
                        });
                    }
                    if (shape.lineHeight) {
                        vars.typography.push({
                            name: prefix + '-line-height',
                            value: String(shape.lineHeight),
                            comment: shape.name + ' line height'
                        });
                    }
                }

                // Flex spacing
                if ('flex' in shape && shape.flex) {
                    if (shape.flex.rowGap) {
                        vars.spacing.push({
                            name: prefix + '-row-gap',
                            value: shape.flex.rowGap + 'px',
                            comment: shape.name + ' row gap'
                        });
                    }
                    if (shape.flex.columnGap) {
                        vars.spacing.push({
                            name: prefix + '-column-gap',
                            value: shape.flex.columnGap + 'px',
                            comment: shape.name + ' column gap'
                        });
                    }
                    
                    const vPad = shape.flex.topPadding || shape.flex.verticalPadding;
                    const hPad = shape.flex.leftPadding || shape.flex.horizontalPadding;
                    
                    if (vPad) {
                        vars.spacing.push({
                            name: prefix + '-padding-v',
                            value: vPad + 'px',
                            comment: shape.name + ' vertical padding'
                        });
                    }
                    if (hPad) {
                        vars.spacing.push({
                            name: prefix + '-padding-h',
                            value: hPad + 'px',
                            comment: shape.name + ' horizontal padding'
                        });
                    }
                }

                // Collect from children
                if (includeChildren && 'children' in shape && shape.children) {
                    shape.children.forEach(child => {
                        const childVars = extractVariables(child, prefix);
                        Object.keys(vars).forEach(key => {
                            vars[key] = [...vars[key], ...childVars[key]];
                        });
                    });
                }

                return vars;
            };

            const variables = extractVariables(targetShape, ${args.prefix ? JSON.stringify(args.prefix) : 'null'});

            return {
                componentName: targetShape.name,
                prefix: ${args.prefix ? JSON.stringify(args.prefix) : 'null'} || toVarName(targetShape.name),
                groupBy: ${JSON.stringify(groupBy)},
                variables: variables,
                counts: {
                    dimensions: variables.dimensions.length,
                    colors: variables.colors.length,
                    typography: variables.typography.length,
                    spacing: variables.spacing.length,
                    borders: variables.borders.length,
                    total: Object.values(variables).reduce((sum, arr) => sum + arr.length, 0)
                }
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Generation failed: ${result.error}`);
        }

        // Format output
        let output = `# CSS Variables: ${result.componentName}\n\n`;
        output += `**Prefix:** \`--${result.prefix}-*\`\n`;
        output += `**Total Variables:** ${result.counts.total}\n\n`;

        output += `## Summary\n\n`;
        output += `| Category | Count |\n`;
        output += `|----------|-------|\n`;
        output += `| Dimensions | ${result.counts.dimensions} |\n`;
        output += `| Colors | ${result.counts.colors} |\n`;
        output += `| Typography | ${result.counts.typography} |\n`;
        output += `| Spacing | ${result.counts.spacing} |\n`;
        output += `| Borders | ${result.counts.borders} |\n\n`;

        // Generate CSS
        output += `## Generated CSS\n\n`;
        output += `\`\`\`css\n:root {\n`;

        const formatVars = (vars: any[], category: string) => {
            if (vars.length === 0) return '';
            let css = `  /* ${category} */\n`;
            vars.forEach((v: any) => {
                css += `  --${v.name}: ${v.value};\n`;
            });
            css += `\n`;
            return css;
        };

        if (groupBy === "property") {
            output += formatVars(result.variables.colors, 'Colors');
            output += formatVars(result.variables.dimensions, 'Dimensions');
            output += formatVars(result.variables.spacing, 'Spacing');
            output += formatVars(result.variables.typography, 'Typography');
            output += formatVars(result.variables.borders, 'Borders');
        } else {
            // Group by element - interleave all variables
            const allVars = [
                ...result.variables.colors,
                ...result.variables.dimensions,
                ...result.variables.spacing,
                ...result.variables.typography,
                ...result.variables.borders
            ];
            
            // Group by element prefix
            const byElement: Record<string, any[]> = {};
            allVars.forEach((v: any) => {
                const parts = v.name.split('-');
                const elementKey = parts.slice(0, -1).join('-');
                if (!byElement[elementKey]) byElement[elementKey] = [];
                byElement[elementKey].push(v);
            });

            Object.entries(byElement).forEach(([element, vars]) => {
                output += `  /* ${element} */\n`;
                vars.forEach((v: any) => {
                    output += `  --${v.name}: ${v.value};\n`;
                });
                output += `\n`;
            });
        }

        output += `}\n\`\`\`\n\n`;

        // Usage examples
        output += `## Usage Examples\n\n`;
        output += `\`\`\`css\n`;
        output += `.${result.prefix} {\n`;
        output += `  width: var(--${result.prefix}-width);\n`;
        output += `  height: var(--${result.prefix}-height);\n`;
        if (result.variables.colors.length > 0) {
            output += `  background-color: var(--${result.variables.colors[0].name});\n`;
        }
        if (result.variables.spacing.length > 0) {
            output += `  gap: var(--${result.variables.spacing[0].name});\n`;
        }
        output += `}\n\`\`\`\n`;

        return new TextResponse(output);
    }
}
