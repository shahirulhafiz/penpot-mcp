import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";
import { SPACING_SCALE } from "./HandoffContext.js";

/**
 * Generates design tokens from Penpot design in multiple framework formats.
 * This tool extracts colors, typography, spacing, and other design values.
 */
export class GenerateDesignTokensTool extends Tool<{
    target: string;
    format: string;
    deduplicateColors?: boolean;
    colorTolerance?: number;
    includeSemanticNames?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to extract tokens from: "selection", "page", "context" (use stored context), or a shape ID'
            ),
            format: z.enum(["css", "tailwind-v3", "tailwind-v4", "scss", "json", "all"]).describe(
                'Output format: "css" (custom properties), "tailwind-v3", "tailwind-v4" (with fallbacks), "scss", "json", or "all"'
            ),
            deduplicateColors: z.boolean().optional().describe(
                'Merge similar colors within tolerance. Default: true'
            ),
            colorTolerance: z.number().optional().describe(
                'Hex distance for color deduplication (0-255). Default: 10'
            ),
            includeSemanticNames: z.boolean().optional().describe(
                'Infer semantic names (primary, success, etc.). Default: true'
            ),
        });
    }

    getToolName(): string {
        return "generate_design_tokens";
    }

    getToolDescription(): string {
        return (
            "Extracts design tokens (colors, typography, spacing, shadows) from a Penpot design " +
            "in multiple framework formats. Supports CSS custom properties, Tailwind v3/v4, SCSS, and JSON. " +
            "Use format 'all' to get all formats at once."
        );
    }

    protected async executeCore(args: {
        target: string;
        format: string;
        deduplicateColors?: boolean;
        colorTolerance?: number;
        includeSemanticNames?: boolean;
    }): Promise<ToolResponse> {
        const deduplicateColors = args.deduplicateColors ?? true;
        const colorTolerance = args.colorTolerance ?? 10;
        const includeSemanticNames = args.includeSemanticNames ?? true;
        const spacingScale = SPACING_SCALE;

        const code = `
            // Get target shape
            let targetShape;
            const targetArg = ${JSON.stringify(args.target)};
            
            if (targetArg === "context") {
                // Use stored context
                if (!storage.handoffContext?.targetId) {
                    return { error: "No context found. Run analyze_design_context first or specify a target." };
                }
                targetShape = penpotUtils.findShapeById(storage.handoffContext.targetId);
            } else if (targetArg === "selection") {
                if (penpot.selection.length === 0) {
                    return { error: "No selection. Please select a shape." };
                }
                targetShape = penpot.selection[0];
            } else if (targetArg === "page") {
                targetShape = penpot.root;
            } else {
                targetShape = penpotUtils.findShapeById(targetArg);
            }

            if (!targetShape) {
                return { error: "Target shape not found." };
            }

            const deduplicateColors = ${deduplicateColors};
            const colorTolerance = ${colorTolerance};
            const includeSemanticNames = ${includeSemanticNames};
            const spacingScale = ${JSON.stringify(spacingScale)};

            // Token collections
            const tokens = {
                colors: new Map(),      // hex -> { value, usedIn[], count }
                typography: new Map(),  // key -> { fontFamily, fontSize, fontWeight, lineHeight }
                spacing: new Map(),     // value -> { usedIn[], count }
                borderRadius: new Map(),// value -> { usedIn[], count }
                shadows: []
            };

            /**
             * Calculate color distance for deduplication
             */
            function colorDistance(hex1, hex2) {
                const r1 = parseInt(hex1.slice(1, 3), 16);
                const g1 = parseInt(hex1.slice(3, 5), 16);
                const b1 = parseInt(hex1.slice(5, 7), 16);
                const r2 = parseInt(hex2.slice(1, 3), 16);
                const g2 = parseInt(hex2.slice(3, 5), 16);
                const b2 = parseInt(hex2.slice(5, 7), 16);
                return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
            }

            /**
             * Find closest color in collection
             */
            function findSimilarColor(hex) {
                if (!deduplicateColors) return null;
                for (const [existingHex, _] of tokens.colors) {
                    if (colorDistance(hex, existingHex) <= colorTolerance) {
                        return existingHex;
                    }
                }
                return null;
            }

            /**
             * Add color token
             */
            function addColor(hex, shapeName) {
                if (!hex || typeof hex !== 'string') return;
                const normalizedHex = hex.toLowerCase();
                
                const similar = findSimilarColor(normalizedHex);
                const key = similar || normalizedHex;
                
                if (tokens.colors.has(key)) {
                    const existing = tokens.colors.get(key);
                    existing.count++;
                    if (!existing.usedIn.includes(shapeName)) {
                        existing.usedIn.push(shapeName);
                    }
                } else {
                    tokens.colors.set(key, {
                        value: key,
                        usedIn: [shapeName],
                        count: 1
                    });
                }
            }

            /**
             * Add typography token
             */
            function addTypography(shape) {
                if (shape.type !== 'text') return;
                
                const key = [
                    shape.fontFamily || 'sans-serif',
                    shape.fontSize || 16,
                    shape.fontWeight || 400
                ].join('-');
                
                if (!tokens.typography.has(key)) {
                    tokens.typography.set(key, {
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        fontWeight: shape.fontWeight,
                        lineHeight: shape.lineHeight,
                        usedIn: [shape.name],
                        count: 1
                    });
                } else {
                    const existing = tokens.typography.get(key);
                    existing.count++;
                    if (!existing.usedIn.includes(shape.name)) {
                        existing.usedIn.push(shape.name);
                    }
                }
            }

            /**
             * Add spacing token
             */
            function addSpacing(value, context) {
                if (typeof value !== 'number' || value <= 0) return;
                const rounded = Math.round(value);
                
                if (tokens.spacing.has(rounded)) {
                    const existing = tokens.spacing.get(rounded);
                    existing.count++;
                    if (!existing.usedIn.includes(context)) {
                        existing.usedIn.push(context);
                    }
                } else {
                    tokens.spacing.set(rounded, {
                        value: rounded,
                        usedIn: [context],
                        count: 1
                    });
                }
            }

            /**
             * Add border radius token
             */
            function addBorderRadius(value, shapeName) {
                if (typeof value !== 'number' || value <= 0) return;
                const rounded = Math.round(value);
                
                if (tokens.borderRadius.has(rounded)) {
                    const existing = tokens.borderRadius.get(rounded);
                    existing.count++;
                    if (!existing.usedIn.includes(shapeName)) {
                        existing.usedIn.push(shapeName);
                    }
                } else {
                    tokens.borderRadius.set(rounded, {
                        value: rounded,
                        usedIn: [shapeName],
                        count: 1
                    });
                }
            }

            /**
             * Extract tokens from shape
             */
            function extractFromShape(shape) {
                // Extract fills (colors)
                if ('fills' in shape && shape.fills) {
                    shape.fills.forEach(fill => {
                        if (fill.fillColor) {
                            addColor(fill.fillColor, shape.name);
                        }
                    });
                }

                // Extract strokes
                if ('strokes' in shape && shape.strokes) {
                    shape.strokes.forEach(stroke => {
                        if (stroke.strokeColor) {
                            addColor(stroke.strokeColor, shape.name + ' (stroke)');
                        }
                    });
                }

                // Extract typography
                addTypography(shape);

                // Extract border radius
                if ('borderRadius' in shape && shape.borderRadius) {
                    addBorderRadius(shape.borderRadius, shape.name);
                }

                // Extract layout spacing
                if ('flex' in shape && shape.flex) {
                    const flex = shape.flex;
                    if (flex.rowGap) addSpacing(flex.rowGap, shape.name + ' (row-gap)');
                    if (flex.columnGap) addSpacing(flex.columnGap, shape.name + ' (column-gap)');
                    if (flex.topPadding) addSpacing(flex.topPadding, shape.name + ' (padding-top)');
                    if (flex.rightPadding) addSpacing(flex.rightPadding, shape.name + ' (padding-right)');
                    if (flex.bottomPadding) addSpacing(flex.bottomPadding, shape.name + ' (padding-bottom)');
                    if (flex.leftPadding) addSpacing(flex.leftPadding, shape.name + ' (padding-left)');
                    if (flex.verticalPadding) addSpacing(flex.verticalPadding, shape.name + ' (padding-v)');
                    if (flex.horizontalPadding) addSpacing(flex.horizontalPadding, shape.name + ' (padding-h)');
                }

                // Extract shadow
                if ('shadow' in shape && shape.shadow) {
                    tokens.shadows.push({
                        shape: shape.name,
                        shadow: shape.shadow
                    });
                }

                // Recurse into children
                if ('children' in shape && shape.children) {
                    shape.children.forEach(extractFromShape);
                }
            }

            // Extract all tokens
            extractFromShape(targetShape);

            // Convert Maps to arrays and sort by frequency
            const colorArray = Array.from(tokens.colors.values()).sort((a, b) => b.count - a.count);
            const typographyArray = Array.from(tokens.typography.values()).sort((a, b) => b.count - a.count);
            const spacingArray = Array.from(tokens.spacing.values()).sort((a, b) => a.value - b.value);
            const borderRadiusArray = Array.from(tokens.borderRadius.values()).sort((a, b) => a.value - b.value);

            /**
             * Infer semantic name for color
             */
            function inferColorSemantic(color) {
                if (!includeSemanticNames) return null;
                
                const usageStr = color.usedIn.join(' ').toLowerCase();
                
                // Context-based inference
                if (usageStr.includes('primary') || usageStr.includes('brand') || usageStr.includes('main')) {
                    return 'primary';
                }
                if (usageStr.includes('secondary')) return 'secondary';
                if (usageStr.includes('success') || usageStr.includes('approved') || usageStr.includes('complete') || usageStr.includes('done')) {
                    return 'success';
                }
                if (usageStr.includes('warning') || usageStr.includes('pending') || usageStr.includes('submitted')) {
                    return 'warning';
                }
                if (usageStr.includes('error') || usageStr.includes('danger') || usageStr.includes('reject') || usageStr.includes('fail')) {
                    return 'error';
                }
                if (usageStr.includes('muted') || usageStr.includes('disabled') || usageStr.includes('inactive') || usageStr.includes('draft')) {
                    return 'muted';
                }
                if (usageStr.includes('bg') || usageStr.includes('background') || usageStr.includes('surface') || usageStr.includes('card')) {
                    return 'surface';
                }
                if (usageStr.includes('text') || usageStr.includes('title') || usageStr.includes('heading') || usageStr.includes('body')) {
                    return 'text';
                }
                
                // Color-based inference (simple heuristics)
                const hex = color.value.toLowerCase();
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                
                // Grayscale detection
                if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
                    if (r > 240) return 'white';
                    if (r < 30) return 'black';
                    if (r > 180) return 'gray-100';
                    if (r > 140) return 'gray-300';
                    if (r > 100) return 'gray-500';
                    return 'gray-700';
                }
                
                return null;
            }

            // Add semantic names
            colorArray.forEach((color, index) => {
                color.semanticName = inferColorSemantic(color);
                if (!color.semanticName) {
                    color.semanticName = 'color-' + (index + 1);
                }
            });

            // Store in context
            if (!storage.handoffContext) {
                storage.handoffContext = {};
            }
            storage.handoffContext.tokens = {
                colors: colorArray,
                typography: typographyArray,
                spacing: spacingArray,
                borderRadius: borderRadiusArray,
                shadows: tokens.shadows
            };

            return {
                target: targetShape.name,
                tokens: {
                    colors: colorArray,
                    typography: typographyArray,
                    spacing: spacingArray,
                    borderRadius: borderRadiusArray,
                    shadows: tokens.shadows
                },
                counts: {
                    colors: colorArray.length,
                    typography: typographyArray.length,
                    spacing: spacingArray.length,
                    borderRadius: borderRadiusArray.length,
                    shadows: tokens.shadows.length
                }
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`Error: ${result.error}`);
        }

        // Generate formatted output based on requested format
        const output = this.formatOutput(result, args.format);
        return new TextResponse(output);
    }

    private formatOutput(result: any, format: string): string {
        const tokens = result.tokens;
        let output = `# Design Tokens: ${result.target}\n\n`;

        output += `## Summary\n\n`;
        output += `| Category | Count |\n`;
        output += `|----------|-------|\n`;
        output += `| Colors | ${result.counts.colors} |\n`;
        output += `| Typography | ${result.counts.typography} |\n`;
        output += `| Spacing | ${result.counts.spacing} |\n`;
        output += `| Border Radius | ${result.counts.borderRadius} |\n`;
        output += `\n`;

        // Color tokens table
        output += `## Colors\n\n`;
        output += `| Token | Value | Used In |\n`;
        output += `|-------|-------|----------|\n`;
        for (const color of tokens.colors) {
            output += `| ${color.semanticName} | \`${color.value}\` | ${color.usedIn.slice(0, 3).join(', ')}${color.usedIn.length > 3 ? '...' : ''} |\n`;
        }
        output += `\n`;

        // Typography tokens
        if (tokens.typography.length > 0) {
            output += `## Typography\n\n`;
            output += `| Font | Size | Weight | Used In |\n`;
            output += `|------|------|--------|----------|\n`;
            for (const typo of tokens.typography) {
                output += `| ${typo.fontFamily} | ${typo.fontSize}px | ${typo.fontWeight} | ${typo.usedIn[0]} |\n`;
            }
            output += `\n`;
        }

        // Spacing tokens
        if (tokens.spacing.length > 0) {
            output += `## Spacing Scale\n\n`;
            output += `| Value | Used In |\n`;
            output += `|-------|----------|\n`;
            for (const sp of tokens.spacing) {
                output += `| ${sp.value}px | ${sp.usedIn.slice(0, 2).join(', ')} |\n`;
            }
            output += `\n`;
        }

        // Border radius tokens
        if (tokens.borderRadius.length > 0) {
            output += `## Border Radius\n\n`;
            output += `| Value | Used In |\n`;
            output += `|-------|----------|\n`;
            for (const br of tokens.borderRadius) {
                output += `| ${br.value}px | ${br.usedIn.slice(0, 2).join(', ')} |\n`;
            }
            output += `\n`;
        }

        // Generate format-specific output
        if (format === "all" || format === "css") {
            output += `## CSS Custom Properties\n\n`;
            output += this.generateCss(tokens);
        }

        if (format === "all" || format === "tailwind-v4") {
            output += `## Tailwind CSS v4\n\n`;
            output += this.generateTailwindV4(tokens);
        }

        if (format === "all" || format === "tailwind-v3") {
            output += `## Tailwind CSS v3 Config\n\n`;
            output += this.generateTailwindV3(tokens);
        }

        if (format === "all" || format === "scss") {
            output += `## SCSS Variables\n\n`;
            output += this.generateScss(tokens);
        }

        if (format === "all" || format === "json") {
            output += `## JSON Tokens\n\n`;
            output += "```json\n" + JSON.stringify(tokens, null, 2) + "\n```\n\n";
        }

        output += `---\n`;
        output += `*Tokens saved to context. Run \`detect_component_states\` next to find visual variants.*\n`;

        return output;
    }

    private generateCss(tokens: any): string {
        let css = "```css\n:root {\n";
        css += "  /* Colors */\n";
        for (const color of tokens.colors) {
            css += `  --color-${color.semanticName}: ${color.value};\n`;
        }

        if (tokens.spacing.length > 0) {
            css += "\n  /* Spacing */\n";
            for (const sp of tokens.spacing) {
                css += `  --spacing-${sp.value}: ${sp.value}px;\n`;
            }
        }

        if (tokens.borderRadius.length > 0) {
            css += "\n  /* Border Radius */\n";
            for (const br of tokens.borderRadius) {
                css += `  --radius-${br.value}: ${br.value}px;\n`;
            }
        }

        if (tokens.typography.length > 0) {
            css += "\n  /* Typography */\n";
            const uniqueFonts = new Set(tokens.typography.map((t: any) => t.fontFamily));
            for (const font of uniqueFonts) {
                const safeName = String(font).toLowerCase().replace(/\s+/g, '-');
                css += `  --font-${safeName}: "${font}", sans-serif;\n`;
            }
        }

        css += "}\n```\n\n";
        return css;
    }

    private generateTailwindV4(tokens: any): string {
        let output = "```css\n@import 'tailwindcss';\n\n@theme {\n";
        
        output += "  /* Colors */\n";
        for (const color of tokens.colors) {
            output += `  --color-${color.semanticName}: ${color.value};\n`;
        }

        if (tokens.spacing.length > 0) {
            output += "\n  /* Spacing */\n";
            for (const sp of tokens.spacing) {
                output += `  --spacing-${sp.value}: ${sp.value}px;\n`;
            }
        }

        if (tokens.borderRadius.length > 0) {
            output += "\n  /* Border Radius */\n";
            for (const br of tokens.borderRadius) {
                output += `  --radius-${br.value}: ${br.value}px;\n`;
            }
        }

        output += "}\n\n";
        
        // Add fallback utility classes for v4 compatibility
        output += "/* Fallback utility classes for Tailwind v4 compatibility */\n";
        output += ":root {\n";
        for (const color of tokens.colors) {
            output += `  --color-${color.semanticName}: ${color.value};\n`;
        }
        output += "}\n\n";
        
        for (const color of tokens.colors) {
            output += `.bg-${color.semanticName} { background-color: var(--color-${color.semanticName}); }\n`;
            output += `.text-${color.semanticName} { color: var(--color-${color.semanticName}); }\n`;
            output += `.border-${color.semanticName} { border-color: var(--color-${color.semanticName}); }\n`;
        }

        output += "```\n\n";
        return output;
    }

    private generateTailwindV3(tokens: any): string {
        const config: any = {
            theme: {
                extend: {
                    colors: {},
                    spacing: {},
                    borderRadius: {},
                    fontFamily: {}
                }
            }
        };

        for (const color of tokens.colors) {
            config.theme.extend.colors[color.semanticName] = color.value;
        }

        for (const sp of tokens.spacing) {
            config.theme.extend.spacing[String(sp.value)] = `${sp.value}px`;
        }

        for (const br of tokens.borderRadius) {
            config.theme.extend.borderRadius[`${br.value}`] = `${br.value}px`;
        }

        const uniqueFonts = new Set(tokens.typography.map((t: any) => t.fontFamily));
        for (const font of uniqueFonts) {
            const safeName = String(font).toLowerCase().replace(/\s+/g, '-');
            config.theme.extend.fontFamily[safeName] = [`"${font}"`, 'sans-serif'];
        }

        return "```javascript\n// tailwind.config.js\nmodule.exports = " + JSON.stringify(config, null, 2) + "\n```\n\n";
    }

    private generateScss(tokens: any): string {
        let scss = "```scss\n// Colors\n";
        for (const color of tokens.colors) {
            scss += `$color-${color.semanticName}: ${color.value};\n`;
        }

        if (tokens.spacing.length > 0) {
            scss += "\n// Spacing\n";
            for (const sp of tokens.spacing) {
                scss += `$spacing-${sp.value}: ${sp.value}px;\n`;
            }
        }

        if (tokens.borderRadius.length > 0) {
            scss += "\n// Border Radius\n";
            for (const br of tokens.borderRadius) {
                scss += `$radius-${br.value}: ${br.value}px;\n`;
            }
        }

        if (tokens.typography.length > 0) {
            scss += "\n// Typography\n";
            const uniqueFonts = new Set(tokens.typography.map((t: any) => t.fontFamily));
            for (const font of uniqueFonts) {
                const safeName = String(font).toLowerCase().replace(/\s+/g, '-');
                scss += `$font-${safeName}: "${font}", sans-serif;\n`;
            }
        }

        scss += "```\n\n";
        return scss;
    }
}
