import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Detects visual states/variants within a design.
 * Identifies patterns like selected, hover, disabled states by comparing
 * visually similar components.
 */
export class DetectComponentStatesTool extends Tool<{
    target: string;
    customPatterns?: string;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to analyze: "selection", "page", "context" (use stored context), or a shape ID'
            ),
            customPatterns: z.string().optional().describe(
                'JSON string of custom state patterns. Format: {"selected": ["active", "current"], "disabled": ["inactive"]}. Uses defaults if not provided.'
            ),
        });
    }

    getToolName(): string {
        return "detect_component_states";
    }

    getToolDescription(): string {
        return (
            "Detects visual states/variants within a design (selected, hover, disabled, etc.). " +
            "Compares similar components to identify style differences and state triggers. " +
            "Essential for implementing interactive components correctly."
        );
    }

    protected async executeCore(args: {
        target: string;
        customPatterns?: string;
    }): Promise<ToolResponse> {
        const defaultPatterns: Record<string, string[]> = {
            selected: ['selected', 'active', 'current', 'checked', 'on'],
            hover: ['hover', 'hovered', 'over', 'focus', 'focused'],
            disabled: ['disabled', 'inactive', 'muted', 'ghost', 'readonly'],
            default: ['default', 'normal', 'idle', 'base'],
            error: ['error', 'invalid', 'danger', 'fail'],
            success: ['success', 'valid', 'complete', 'done'],
            warning: ['warning', 'caution', 'pending'],
            loading: ['loading', 'spinner', 'progress']
        };

        let patterns = defaultPatterns;
        if (args.customPatterns) {
            try {
                const customPatterns = JSON.parse(args.customPatterns);
                patterns = { ...defaultPatterns, ...customPatterns };
            } catch (e) {
                // Use defaults if JSON parsing fails
            }
        }

        const code = `
            // Get target shape
            let targetShape;
            const targetArg = ${JSON.stringify(args.target)};
            
            if (targetArg === "context") {
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

            const statePatterns = ${JSON.stringify(patterns)};

            /**
             * Extract style properties from a shape
             */
            function extractStyles(shape) {
                const styles = {
                    type: shape.type,
                    width: Math.round(shape.width),
                    height: Math.round(shape.height)
                };

                // Fills
                if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                    const fill = shape.fills[0];
                    if (fill.fillColor) {
                        styles.background = fill.fillColor;
                        styles.backgroundOpacity = fill.fillOpacity ?? 1;
                    }
                }

                // Strokes
                if ('strokes' in shape && shape.strokes && shape.strokes.length > 0) {
                    const stroke = shape.strokes[0];
                    if (stroke.strokeColor) {
                        styles.borderColor = stroke.strokeColor;
                        styles.borderWidth = stroke.strokeWidth;
                    }
                }

                // Border radius
                if ('borderRadius' in shape && shape.borderRadius) {
                    styles.borderRadius = shape.borderRadius;
                }

                // Typography
                if (shape.type === 'text') {
                    if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                        styles.textColor = shape.fills[0].fillColor;
                    }
                    styles.fontSize = shape.fontSize;
                    styles.fontWeight = shape.fontWeight;
                }

                // Shadow
                if ('shadow' in shape && shape.shadow) {
                    styles.shadow = 'present';
                }

                // Opacity
                if ('opacity' in shape && shape.opacity !== undefined && shape.opacity !== 1) {
                    styles.opacity = shape.opacity;
                }

                return styles;
            }

            /**
             * Detect state from name
             */
            function detectState(name) {
                const lowerName = name.toLowerCase();
                for (const [state, patterns] of Object.entries(statePatterns)) {
                    for (const pattern of patterns) {
                        if (lowerName.includes(pattern.toLowerCase())) {
                            return state;
                        }
                    }
                }
                return null;
            }

            /**
             * Get base name by removing state indicators
             */
            function getBaseName(name) {
                let baseName = name;
                for (const patterns of Object.values(statePatterns)) {
                    for (const pattern of patterns) {
                        const regex = new RegExp('\\\\s*[-_]?\\\\s*' + pattern + '\\\\s*[-_]?\\\\s*', 'gi');
                        baseName = baseName.replace(regex, ' ');
                    }
                }
                return baseName.trim().toLowerCase().replace(/\\s+/g, ' ');
            }

            /**
             * Calculate style differences between two shapes
             */
            function styleDiff(styles1, styles2) {
                const diff = {};
                const allKeys = new Set([...Object.keys(styles1), ...Object.keys(styles2)]);
                
                for (const key of allKeys) {
                    if (styles1[key] !== styles2[key]) {
                        diff[key] = {
                            from: styles1[key],
                            to: styles2[key]
                        };
                    }
                }
                
                return diff;
            }

            /**
             * Collect all shapes with their names
             */
            function collectShapes(shape, results = []) {
                results.push({
                    id: shape.id,
                    name: shape.name,
                    type: shape.type,
                    baseName: getBaseName(shape.name),
                    detectedState: detectState(shape.name),
                    styles: extractStyles(shape)
                });

                if ('children' in shape && shape.children) {
                    shape.children.forEach(child => collectShapes(child, results));
                }

                return results;
            }

            // Collect all shapes
            const allShapes = collectShapes(targetShape);

            // Group shapes by base name to find variants
            const groups = new Map();
            for (const shape of allShapes) {
                if (shape.baseName.length > 2) { // Skip very short names
                    if (!groups.has(shape.baseName)) {
                        groups.set(shape.baseName, []);
                    }
                    groups.get(shape.baseName).push(shape);
                }
            }

            // Find groups with multiple variants
            const componentStates = [];
            
            for (const [baseName, variants] of groups) {
                if (variants.length >= 2) {
                    // This is a potential component with states
                    const statesFound = variants.map(v => ({
                        state: v.detectedState || 'variant-' + variants.indexOf(v),
                        exampleName: v.name,
                        exampleId: v.id,
                        styles: v.styles
                    }));

                    // Find the default state for comparison
                    const defaultVariant = statesFound.find(s => s.state === 'default') || statesFound[0];

                    // Calculate differences from default
                    const variantsWithDiff = statesFound.map(variant => {
                        if (variant === defaultVariant) {
                            return { ...variant, styleDiff: {} };
                        }
                        return {
                            ...variant,
                            styleDiff: styleDiff(defaultVariant.styles, variant.styles)
                        };
                    });

                    // Generate implementation hint
                    let hint = '';
                    const stateNames = statesFound.map(s => s.state).filter(s => s !== 'default' && !s.startsWith('variant'));
                    if (stateNames.includes('selected')) {
                        hint = 'Add isSelected/active prop for conditional styling';
                    } else if (stateNames.includes('hover')) {
                        hint = 'Use CSS :hover pseudo-class or onMouseEnter/Leave';
                    } else if (stateNames.includes('disabled')) {
                        hint = 'Add disabled prop, reduce opacity and disable pointer events';
                    }

                    componentStates.push({
                        componentName: baseName,
                        pattern: variants[0].name.split(/\\s+/)[0],
                        variantCount: variants.length,
                        variants: variantsWithDiff,
                        implementationHint: hint || 'Use conditional CSS classes based on state prop'
                    });
                }
            }

            // Also detect status-based variants (like badges with different statuses)
            const statusVariants = [];
            const statusPatterns = ['approved', 'submitted', 'draft', 'pending', 'complete', 'error', 'success', 'warning'];
            
            for (const shape of allShapes) {
                const lowerName = shape.name.toLowerCase();
                for (const status of statusPatterns) {
                    if (lowerName.includes(status)) {
                        statusVariants.push({
                            name: shape.name,
                            status: status,
                            styles: shape.styles
                        });
                        break;
                    }
                }
            }

            // Group status variants by base component
            const statusGroups = new Map();
            for (const sv of statusVariants) {
                const base = sv.name.toLowerCase()
                    .replace(/approved|submitted|draft|pending|complete|error|success|warning/gi, '')
                    .trim();
                if (!statusGroups.has(base)) {
                    statusGroups.set(base, []);
                }
                statusGroups.get(base).push(sv);
            }

            for (const [base, variants] of statusGroups) {
                if (variants.length >= 2 && base.length > 2) {
                    componentStates.push({
                        componentName: base || 'Status Component',
                        pattern: 'status-based',
                        variantCount: variants.length,
                        variants: variants.map(v => ({
                            state: v.status,
                            exampleName: v.name,
                            styles: v.styles,
                            styleDiff: {}
                        })),
                        implementationHint: 'Create component with status prop: ' + variants.map(v => v.status).join(' | ')
                    });
                }
            }

            // Store in context
            if (!storage.handoffContext) {
                storage.handoffContext = {};
            }
            storage.handoffContext.states = {
                components: componentStates
            };

            return {
                target: targetShape.name,
                totalShapesAnalyzed: allShapes.length,
                componentsWithStates: componentStates.length,
                components: componentStates
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`Error: ${result.error}`);
        }

        // Format output
        let output = `# Component States Detection\n\n`;
        output += `**Target:** ${result.target}\n`;
        output += `**Shapes Analyzed:** ${result.totalShapesAnalyzed}\n`;
        output += `**Components with States:** ${result.componentsWithStates}\n\n`;

        if (result.components.length === 0) {
            output += `No component variants detected. This could mean:\n`;
            output += `- The design uses unique names for each element\n`;
            output += `- State variants are not explicitly named\n`;
            output += `- Try using custom state patterns matching your naming convention\n\n`;
        } else {
            for (const comp of result.components) {
                output += `## ${comp.componentName}\n\n`;
                output += `**Pattern:** ${comp.pattern}\n`;
                output += `**Variants:** ${comp.variantCount}\n`;
                output += `**Hint:** ${comp.implementationHint}\n\n`;

                output += `| State | Example | Key Style Differences |\n`;
                output += `|-------|---------|----------------------|\n`;
                for (const variant of comp.variants) {
                    const diffStr = Object.entries(variant.styleDiff || {})
                        .slice(0, 3)
                        .map(([k, v]: [string, any]) => `${k}: ${v.to || v}`)
                        .join(', ') || 'base state';
                    output += `| ${variant.state} | ${variant.exampleName} | ${diffStr} |\n`;
                }
                output += `\n`;

                // Show detailed styles for each variant
                output += `### Styles by State\n\n`;
                for (const variant of comp.variants) {
                    output += `**${variant.state}:**\n`;
                    output += "```css\n";
                    for (const [key, value] of Object.entries(variant.styles)) {
                        if (value && key !== 'type') {
                            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                            output += `  ${cssKey}: ${value};\n`;
                        }
                    }
                    output += "```\n\n";
                }
            }
        }

        output += `---\n`;
        output += `*States saved to context. Run \`identify_external_assets\` next to find fonts and icons.*\n`;

        return new TextResponse(output);
    }
}
