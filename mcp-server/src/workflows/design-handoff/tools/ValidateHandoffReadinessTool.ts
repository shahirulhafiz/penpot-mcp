import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Validates design readiness for implementation handoff.
 * Checks for common issues that cause implementation mismatches:
 * - Text format variations (uppercase, dates, numbers)
 * - Status/state coverage for variants
 * - Dimension consistency
 * - Interactive element detection
 * - Content patterns (required fields, icons)
 */
export class ValidateHandoffReadinessTool extends Tool<{
    target: string;
    checks?: string[];
    generateChecklist?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to validate: "selection", "page", "context" (use stored context), or a shape ID'
            ),
            checks: z.array(z.string()).optional().describe(
                'Optional array of check types: "text-formats", "status-variants", "dimensions", ' +
                '"interactive-elements", "layout-types", "content-patterns", "color-tokens". Default: all checks.'
            ),
            generateChecklist: z.boolean().optional().describe(
                'If true, generates an implementation checklist. Default: true'
            ),
        });
    }

    getToolName(): string {
        return "validate_handoff_readiness";
    }

    getToolDescription(): string {
        return (
            "Validates design readiness BEFORE implementation. Checks for text format variations, " +
            "status badge states, dimension consistency, and content patterns that commonly cause " +
            "implementation mismatches. ALWAYS run this before starting code implementation."
        );
    }

    protected async executeCore(args: {
        target: string;
        checks?: string[];
        generateChecklist?: boolean;
    }): Promise<ToolResponse> {
        const allChecks = [
            "text-formats",
            "status-variants", 
            "dimensions",
            "interactive-elements",
            "layout-types",
            "content-patterns",
            "color-tokens"
        ];
        const checksToRun = args.checks && args.checks.length > 0 ? args.checks : allChecks;
        const generateChecklist = args.generateChecklist ?? true;

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
                    return { error: "No selection. Please select a shape or use 'page' as target." };
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

            const checksToRun = ${JSON.stringify(checksToRun)};
            const results = {
                target: { id: targetShape.id, name: targetShape.name, type: targetShape.type },
                checks: {},
                summary: { 
                    total: 0, 
                    warnings: 0, 
                    info: 0,
                    implementationNotes: []
                },
                checklist: []
            };

            // Collect all shapes for analysis
            const allShapes = penpotUtils.findShapes(() => true, targetShape);
            const textShapes = allShapes.filter(s => s.type === 'text');
            const boards = allShapes.filter(s => s.type === 'board');

            // TEXT FORMAT DETECTION
            if (checksToRun.includes("text-formats")) {
                const textFormats = {
                    uppercaseTexts: [],
                    datePatterns: [],
                    numberFormats: [],
                    specialCharacters: []
                };

                textShapes.forEach(text => {
                    const content = text.characters || '';
                    
                    // Detect uppercase text (more than 2 uppercase consecutive chars)
                    if (/[A-Z]{2,}/.test(content) && content !== content.toLowerCase()) {
                        const uppercaseMatch = content.match(/[A-Z]{2,}/g);
                        if (uppercaseMatch) {
                            textFormats.uppercaseTexts.push({
                                name: text.name,
                                content: content.substring(0, 50),
                                uppercaseParts: uppercaseMatch.slice(0, 3)
                            });
                        }
                    }

                    // Detect date patterns
                    const datePatterns = [
                        /\\d{1,2}\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
                        /\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4}/,
                        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2}/i,
                        /\\d{4}[-\\/]\\d{2}[-\\/]\\d{2}/
                    ];
                    for (const pattern of datePatterns) {
                        const match = content.match(pattern);
                        if (match) {
                            textFormats.datePatterns.push({
                                name: text.name,
                                content: content.substring(0, 50),
                                format: match[0],
                                pattern: pattern.toString().slice(1, -2)
                            });
                            break;
                        }
                    }

                    // Detect number formats (hours, currency, percentages)
                    const numberPatterns = [
                        { pattern: /\\d+\\.?\\d*\\s*(hrs?|hours?)/i, type: 'hours' },
                        { pattern: /\\d+\\.?\\d*\\s*\\/\\s*\\d+\\.?\\d*/i, type: 'ratio' },
                        { pattern: /[\\$\\€\\£]\\s*\\d+/i, type: 'currency' },
                        { pattern: /\\d+\\s*%/, type: 'percentage' },
                        { pattern: /\\d+h\\s*\\d*m?/i, type: 'duration' }
                    ];
                    for (const { pattern, type } of numberPatterns) {
                        const match = content.match(pattern);
                        if (match) {
                            textFormats.numberFormats.push({
                                name: text.name,
                                content: content.substring(0, 50),
                                format: match[0],
                                type: type
                            });
                        }
                    }

                    // Detect required field markers
                    if (content.includes('*')) {
                        textFormats.specialCharacters.push({
                            name: text.name,
                            content: content.substring(0, 50),
                            marker: '*',
                            purpose: 'likely-required-field'
                        });
                    }
                });

                const issueCount = textFormats.uppercaseTexts.length + 
                                   textFormats.datePatterns.length + 
                                   textFormats.numberFormats.length +
                                   textFormats.specialCharacters.length;

                results.checks["text-formats"] = {
                    detected: issueCount,
                    details: textFormats,
                    implementationNotes: []
                };

                if (textFormats.uppercaseTexts.length > 0) {
                    results.checks["text-formats"].implementationNotes.push(
                        "Use CSS text-transform: uppercase or JavaScript .toUpperCase() for uppercase text"
                    );
                    results.summary.implementationNotes.push({
                        category: 'text',
                        note: \`\${textFormats.uppercaseTexts.length} texts require uppercase formatting\`
                    });
                }

                if (textFormats.datePatterns.length > 0) {
                    const formats = [...new Set(textFormats.datePatterns.map(d => d.format))];
                    results.checks["text-formats"].implementationNotes.push(
                        "Date formats detected: " + formats.join(', ') + " - use consistent date formatter"
                    );
                    results.summary.implementationNotes.push({
                        category: 'text',
                        note: \`Date format patterns: \${formats.join(', ')}\`
                    });
                }

                if (textFormats.numberFormats.length > 0) {
                    const types = [...new Set(textFormats.numberFormats.map(n => n.type))];
                    results.checks["text-formats"].implementationNotes.push(
                        "Number formats detected: " + types.join(', ') + " - implement consistent formatters"
                    );
                }

                if (textFormats.specialCharacters.length > 0) {
                    results.checks["text-formats"].implementationNotes.push(
                        "Required field markers (*) detected - implement validation for these fields"
                    );
                }

                results.summary.info += issueCount;
                results.summary.total += issueCount;
            }

            // STATUS VARIANT DETECTION
            if (checksToRun.includes("status-variants")) {
                const statusKeywords = [
                    'approved', 'submitted', 'draft', 'pending', 'complete', 
                    'error', 'success', 'warning', 'active', 'inactive',
                    'selected', 'disabled', 'hover', 'focus', 'default'
                ];

                const statusVariants = new Map();
                
                allShapes.forEach(shape => {
                    const lowerName = shape.name.toLowerCase();
                    for (const status of statusKeywords) {
                        if (lowerName.includes(status)) {
                            // Extract base component name
                            const baseName = lowerName
                                .replace(new RegExp(status, 'gi'), '')
                                .replace(/[-_\\s]+/g, ' ')
                                .trim();
                            
                            if (baseName.length > 1) {
                                if (!statusVariants.has(baseName)) {
                                    statusVariants.set(baseName, {
                                        baseName,
                                        variants: []
                                    });
                                }
                                
                                // Extract color info
                                let bgColor = null;
                                let textColor = null;
                                let borderColor = null;
                                
                                if ('fills' in shape && shape.fills && shape.fills.length > 0) {
                                    bgColor = shape.fills[0].fillColor;
                                }
                                if ('strokes' in shape && shape.strokes && shape.strokes.length > 0) {
                                    borderColor = shape.strokes[0].strokeColor;
                                }
                                
                                // For text children, get text color
                                if ('children' in shape && shape.children) {
                                    const textChild = shape.children.find(c => c.type === 'text');
                                    if (textChild && 'fills' in textChild && textChild.fills) {
                                        textColor = textChild.fills[0]?.fillColor;
                                    }
                                }

                                statusVariants.get(baseName).variants.push({
                                    status,
                                    shapeName: shape.name,
                                    shapeId: shape.id,
                                    styles: {
                                        background: bgColor,
                                        text: textColor,
                                        border: borderColor,
                                        width: Math.round(shape.width),
                                        height: Math.round(shape.height)
                                    }
                                });
                            }
                            break;
                        }
                    }
                });

                // Filter to only components with multiple variants
                const componentsWithVariants = [];
                for (const [baseName, data] of statusVariants) {
                    if (data.variants.length >= 2) {
                        componentsWithVariants.push(data);
                    }
                }

                results.checks["status-variants"] = {
                    componentsDetected: componentsWithVariants.length,
                    components: componentsWithVariants,
                    implementationNotes: []
                };

                if (componentsWithVariants.length > 0) {
                    componentsWithVariants.forEach(comp => {
                        const statuses = comp.variants.map(v => v.status);
                        results.checks["status-variants"].implementationNotes.push(
                            \`Component "\${comp.baseName}" has \${comp.variants.length} states: \${statuses.join(', ')}\`
                        );
                    });
                    results.summary.implementationNotes.push({
                        category: 'states',
                        note: \`\${componentsWithVariants.length} components have status variants requiring conditional styling\`
                    });
                }

                results.summary.info += componentsWithVariants.length;
                results.summary.total += componentsWithVariants.length;
            }

            // DIMENSION CONSISTENCY
            if (checksToRun.includes("dimensions")) {
                const dimensionGroups = new Map();
                
                // Group similar named elements
                allShapes.forEach(shape => {
                    // Extract base name (remove numbers, status keywords)
                    const baseName = shape.name.toLowerCase()
                        .replace(/\\d+/g, '')
                        .replace(/(active|selected|hover|disabled|default)/gi, '')
                        .trim();
                    
                    if (baseName.length > 2) {
                        if (!dimensionGroups.has(baseName)) {
                            dimensionGroups.set(baseName, []);
                        }
                        dimensionGroups.get(baseName).push({
                            name: shape.name,
                            width: Math.round(shape.width),
                            height: Math.round(shape.height),
                            type: shape.type
                        });
                    }
                });

                // Find inconsistent dimensions
                const inconsistencies = [];
                const fixedDimensions = [];
                
                for (const [baseName, shapes] of dimensionGroups) {
                    if (shapes.length >= 2) {
                        const uniqueDimensions = [...new Set(shapes.map(s => \`\${s.width}x\${s.height}\`))];
                        
                        if (uniqueDimensions.length > 1) {
                            inconsistencies.push({
                                baseName,
                                count: shapes.length,
                                dimensions: uniqueDimensions,
                                shapes: shapes.slice(0, 5)
                            });
                        } else {
                            // Consistent fixed dimension detected
                            fixedDimensions.push({
                                baseName,
                                dimension: uniqueDimensions[0],
                                count: shapes.length
                            });
                        }
                    }
                }

                // Detect key fixed dimensions for the page
                const keyDimensions = {
                    screen: null,
                    sidebar: null,
                    panel: null,
                    card: null,
                    button: null
                };

                boards.forEach(board => {
                    const lowerName = board.name.toLowerCase();
                    const dim = { width: Math.round(board.width), height: Math.round(board.height) };
                    
                    if (lowerName.includes('screen') || lowerName.includes('frame') || lowerName.includes('page')) {
                        if (!keyDimensions.screen || board.width > keyDimensions.screen.width) {
                            keyDimensions.screen = { name: board.name, ...dim };
                        }
                    }
                    if (lowerName.includes('sidebar')) {
                        keyDimensions.sidebar = { name: board.name, ...dim };
                    }
                    if (lowerName.includes('panel') || lowerName.includes('detail')) {
                        if (!keyDimensions.panel || board.width > (keyDimensions.panel?.width || 0)) {
                            keyDimensions.panel = { name: board.name, ...dim };
                        }
                    }
                    if (lowerName.includes('card')) {
                        keyDimensions.card = { name: board.name, ...dim };
                    }
                    if (lowerName.includes('button') || lowerName.includes('btn')) {
                        keyDimensions.button = { name: board.name, ...dim };
                    }
                });

                results.checks["dimensions"] = {
                    inconsistencies: inconsistencies.length,
                    fixedDimensions: fixedDimensions.slice(0, 10),
                    keyDimensions: Object.fromEntries(
                        Object.entries(keyDimensions).filter(([k, v]) => v !== null)
                    ),
                    details: inconsistencies,
                    implementationNotes: []
                };

                if (keyDimensions.screen) {
                    results.checks["dimensions"].implementationNotes.push(
                        \`Fixed screen size: \${keyDimensions.screen.width}x\${keyDimensions.screen.height}px\`
                    );
                }

                if (inconsistencies.length > 0) {
                    results.summary.warnings += inconsistencies.length;
                    results.checks["dimensions"].implementationNotes.push(
                        \`Warning: \${inconsistencies.length} element groups have inconsistent sizes\`
                    );
                }

                results.summary.total += inconsistencies.length;
            }

            // INTERACTIVE ELEMENTS DETECTION
            if (checksToRun.includes("interactive-elements")) {
                const interactivePatterns = [
                    { pattern: /button|btn/i, type: 'button' },
                    { pattern: /input|field|textfield/i, type: 'input' },
                    { pattern: /checkbox|check box/i, type: 'checkbox' },
                    { pattern: /radio/i, type: 'radio' },
                    { pattern: /toggle|switch/i, type: 'toggle' },
                    { pattern: /dropdown|select|combo/i, type: 'dropdown' },
                    { pattern: /tab/i, type: 'tab' },
                    { pattern: /link|anchor/i, type: 'link' },
                    { pattern: /stepper|step/i, type: 'stepper' },
                    { pattern: /card.*click|clickable/i, type: 'clickable-card' },
                    { pattern: /icon.*btn|btn.*icon|close|chevron|arrow/i, type: 'icon-button' }
                ];

                const interactiveElements = [];
                
                allShapes.forEach(shape => {
                    for (const { pattern, type } of interactivePatterns) {
                        if (pattern.test(shape.name)) {
                            interactiveElements.push({
                                name: shape.name,
                                type: type,
                                shapeType: shape.type,
                                dimensions: {
                                    width: Math.round(shape.width),
                                    height: Math.round(shape.height)
                                }
                            });
                            break;
                        }
                    }
                });

                // Group by type
                const byType = {};
                interactiveElements.forEach(el => {
                    if (!byType[el.type]) byType[el.type] = [];
                    byType[el.type].push(el);
                });

                results.checks["interactive-elements"] = {
                    total: interactiveElements.length,
                    byType,
                    implementationNotes: []
                };

                Object.entries(byType).forEach(([type, elements]) => {
                    results.checks["interactive-elements"].implementationNotes.push(
                        \`\${elements.length} \${type}(s) detected - implement with proper event handlers\`
                    );
                });

                // Check for small touch targets
                const smallTargets = interactiveElements.filter(el => 
                    el.dimensions.width < 44 || el.dimensions.height < 44
                );
                if (smallTargets.length > 0) {
                    results.summary.warnings += 1;
                    results.checks["interactive-elements"].implementationNotes.push(
                        \`Warning: \${smallTargets.length} interactive elements smaller than 44x44px (accessibility concern)\`
                    );
                }

                results.summary.info += interactiveElements.length;
                results.summary.total += interactiveElements.length;
            }

            // LAYOUT TYPES
            if (checksToRun.includes("layout-types")) {
                const layoutAnalysis = {
                    flexContainers: [],
                    gridContainers: [],
                    absolutePositioned: []
                };

                boards.forEach(board => {
                    if (board.flex) {
                        layoutAnalysis.flexContainers.push({
                            name: board.name,
                            direction: board.flex.dir,
                            gap: board.flex.rowGap || board.flex.columnGap,
                            padding: {
                                h: board.flex.horizontalPadding,
                                v: board.flex.verticalPadding
                            }
                        });
                    } else if (board.grid) {
                        layoutAnalysis.gridContainers.push({
                            name: board.name,
                            rows: board.grid.rows?.length,
                            cols: board.grid.columns?.length
                        });
                    } else if ('children' in board && board.children && board.children.length > 1) {
                        // Boards with children but no layout system
                        layoutAnalysis.absolutePositioned.push({
                            name: board.name,
                            childCount: board.children.length
                        });
                    }
                });

                results.checks["layout-types"] = {
                    flex: layoutAnalysis.flexContainers.length,
                    grid: layoutAnalysis.gridContainers.length,
                    absolute: layoutAnalysis.absolutePositioned.length,
                    details: layoutAnalysis,
                    implementationNotes: []
                };

                if (layoutAnalysis.flexContainers.length > 0) {
                    results.checks["layout-types"].implementationNotes.push(
                        \`\${layoutAnalysis.flexContainers.length} flex containers - use CSS flexbox\`
                    );
                }

                if (layoutAnalysis.absolutePositioned.length > 0) {
                    results.summary.warnings += 1;
                    results.checks["layout-types"].implementationNotes.push(
                        \`Warning: \${layoutAnalysis.absolutePositioned.length} containers use absolute positioning - may need manual pixel positioning\`
                    );
                }

                results.summary.info += layoutAnalysis.flexContainers.length + layoutAnalysis.gridContainers.length;
                results.summary.total += layoutAnalysis.flexContainers.length + layoutAnalysis.gridContainers.length + layoutAnalysis.absolutePositioned.length;
            }

            // CONTENT PATTERNS
            if (checksToRun.includes("content-patterns")) {
                const patterns = {
                    requiredFields: [],
                    iconUsage: [],
                    placeholders: [],
                    labels: []
                };

                textShapes.forEach(text => {
                    const content = text.characters || '';
                    const lowerContent = content.toLowerCase();
                    const lowerName = text.name.toLowerCase();

                    // Required field detection
                    if (content.includes('*') || lowerName.includes('required')) {
                        patterns.requiredFields.push({
                            name: text.name,
                            content: content.substring(0, 30)
                        });
                    }

                    // Placeholder detection
                    if (lowerName.includes('placeholder') || 
                        lowerContent.includes('enter') ||
                        lowerContent.includes('type here') ||
                        lowerContent.includes('select')) {
                        patterns.placeholders.push({
                            name: text.name,
                            content: content.substring(0, 30)
                        });
                    }

                    // Label detection
                    if (lowerName.includes('label') || lowerContent.endsWith(':')) {
                        patterns.labels.push({
                            name: text.name,
                            content: content.substring(0, 30)
                        });
                    }
                });

                // Icon detection (Material Symbols, Font Awesome, etc.)
                const iconPatterns = [
                    /chevron|arrow|close|menu|search|home|settings|edit|delete|add|remove|check|cross/i,
                    /^[a-z_]+$/ // Material icon naming convention
                ];
                
                textShapes.forEach(text => {
                    const content = text.characters || '';
                    if (content.length <= 20) { // Icons are usually short
                        for (const pattern of iconPatterns) {
                            if (pattern.test(content) || pattern.test(text.name)) {
                                patterns.iconUsage.push({
                                    name: text.name,
                                    content: content,
                                    likelyIcon: true
                                });
                                break;
                            }
                        }
                    }
                });

                results.checks["content-patterns"] = {
                    requiredFields: patterns.requiredFields.length,
                    icons: patterns.iconUsage.length,
                    placeholders: patterns.placeholders.length,
                    labels: patterns.labels.length,
                    details: patterns,
                    implementationNotes: []
                };

                if (patterns.requiredFields.length > 0) {
                    results.checks["content-patterns"].implementationNotes.push(
                        \`\${patterns.requiredFields.length} required fields detected - implement validation\`
                    );
                }

                if (patterns.iconUsage.length > 0) {
                    results.checks["content-patterns"].implementationNotes.push(
                        \`\${patterns.iconUsage.length} potential icons detected - verify icon font/library usage\`
                    );
                }

                results.summary.info += patterns.requiredFields.length + patterns.iconUsage.length;
                results.summary.total += patterns.requiredFields.length + patterns.iconUsage.length + patterns.placeholders.length;
            }

            // COLOR TOKEN EXTRACTION
            if (checksToRun.includes("color-tokens")) {
                const colorMap = new Map();
                
                allShapes.forEach(shape => {
                    // Background colors
                    if ('fills' in shape && shape.fills) {
                        shape.fills.forEach(fill => {
                            if (fill.fillColor) {
                                const color = fill.fillColor.toLowerCase();
                                if (!colorMap.has(color)) {
                                    colorMap.set(color, { color, usages: [], count: 0 });
                                }
                                colorMap.get(color).usages.push(\`\${shape.name} (fill)\`);
                                colorMap.get(color).count++;
                            }
                        });
                    }

                    // Stroke/border colors
                    if ('strokes' in shape && shape.strokes) {
                        shape.strokes.forEach(stroke => {
                            if (stroke.strokeColor) {
                                const color = stroke.strokeColor.toLowerCase();
                                if (!colorMap.has(color)) {
                                    colorMap.set(color, { color, usages: [], count: 0 });
                                }
                                colorMap.get(color).usages.push(\`\${shape.name} (stroke)\`);
                                colorMap.get(color).count++;
                            }
                        });
                    }
                });

                // Sort by usage count
                const colors = [...colorMap.values()]
                    .sort((a, b) => b.count - a.count)
                    .map(c => ({
                        color: c.color,
                        count: c.count,
                        sampleUsages: c.usages.slice(0, 3)
                    }));

                results.checks["color-tokens"] = {
                    uniqueColors: colors.length,
                    colors: colors.slice(0, 20),
                    implementationNotes: []
                };

                results.checks["color-tokens"].implementationNotes.push(
                    \`\${colors.length} unique colors detected - extract as CSS variables/design tokens\`
                );

                results.summary.info += colors.length;
                results.summary.total += colors.length;
            }

            // Generate implementation checklist
            if (${generateChecklist}) {
                results.checklist = [
                    { item: "Extract design tokens (colors, typography, spacing)", category: "setup" },
                    { item: "Set up external assets (fonts, icons)", category: "setup" }
                ];

                if (results.checks["text-formats"]?.details?.uppercaseTexts?.length > 0) {
                    results.checklist.push({
                        item: \`Apply text-transform: uppercase to \${results.checks["text-formats"].details.uppercaseTexts.length} elements\`,
                        category: "styling"
                    });
                }

                if (results.checks["text-formats"]?.details?.datePatterns?.length > 0) {
                    results.checklist.push({
                        item: "Implement consistent date formatter",
                        category: "formatting"
                    });
                }

                if (results.checks["status-variants"]?.componentsDetected > 0) {
                    results.checks["status-variants"].components.forEach(comp => {
                        results.checklist.push({
                            item: \`Implement \${comp.variants.length} status states for "\${comp.baseName}"\`,
                            category: "states"
                        });
                    });
                }

                if (results.checks["interactive-elements"]?.total > 0) {
                    Object.entries(results.checks["interactive-elements"].byType || {}).forEach(([type, elements]) => {
                        results.checklist.push({
                            item: \`Implement \${elements.length} \${type} component(s) with event handlers\`,
                            category: "components"
                        });
                    });
                }

                if (results.checks["dimensions"]?.keyDimensions) {
                    Object.entries(results.checks["dimensions"].keyDimensions).forEach(([key, dim]) => {
                        if (dim) {
                            results.checklist.push({
                                item: \`Set \${key} to fixed \${dim.width}x\${dim.height}px\`,
                                category: "layout"
                            });
                        }
                    });
                }

                if (results.checks["content-patterns"]?.requiredFields > 0) {
                    results.checklist.push({
                        item: \`Implement form validation for \${results.checks["content-patterns"].requiredFields} required fields\`,
                        category: "validation"
                    });
                }
            }

            // Store in context for other tools
            if (!storage.handoffContext) {
                storage.handoffContext = {};
            }
            storage.handoffContext.validation = results;

            return results;
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Validation failed: ${result.error}`);
        }

        // Format the results
        let output = `# Design Handoff Readiness Report\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n\n`;
        
        output += `## Summary\n`;
        output += `- Total Items Detected: ${result.summary.total}\n`;
        output += `- Warnings: ${result.summary.warnings}\n`;
        output += `- Info Items: ${result.summary.info}\n\n`;

        // Key implementation notes
        if (result.summary.implementationNotes.length > 0) {
            output += `## Key Implementation Notes\n\n`;
            result.summary.implementationNotes.forEach((note: any) => {
                output += `- **[${note.category}]** ${note.note}\n`;
            });
            output += `\n`;
        }

        // Detailed results by category
        output += `## Detailed Analysis\n\n`;

        // Text formats
        if (result.checks["text-formats"]) {
            const tf = result.checks["text-formats"];
            output += `### Text Formats\n`;
            output += `Detected ${tf.detected} text formatting patterns.\n\n`;
            
            if (tf.details.uppercaseTexts.length > 0) {
                output += `**Uppercase Text (${tf.details.uppercaseTexts.length}):**\n`;
                tf.details.uppercaseTexts.slice(0, 5).forEach((t: any) => {
                    output += `- ${t.name}: "${t.content}" → parts: ${t.uppercaseParts.join(', ')}\n`;
                });
                output += `\n`;
            }

            if (tf.details.datePatterns.length > 0) {
                output += `**Date Patterns (${tf.details.datePatterns.length}):**\n`;
                tf.details.datePatterns.slice(0, 5).forEach((d: any) => {
                    output += `- ${d.name}: "${d.format}"\n`;
                });
                output += `\n`;
            }

            if (tf.details.numberFormats.length > 0) {
                output += `**Number Formats (${tf.details.numberFormats.length}):**\n`;
                tf.details.numberFormats.slice(0, 5).forEach((n: any) => {
                    output += `- ${n.name}: "${n.format}" (${n.type})\n`;
                });
                output += `\n`;
            }

            if (tf.implementationNotes.length > 0) {
                output += `**Notes:**\n`;
                tf.implementationNotes.forEach((note: string) => {
                    output += `- ${note}\n`;
                });
                output += `\n`;
            }
        }

        // Status variants
        if (result.checks["status-variants"]) {
            const sv = result.checks["status-variants"];
            output += `### Status Variants\n`;
            output += `Found ${sv.componentsDetected} components with status variants.\n\n`;

            if (sv.components && sv.components.length > 0) {
                sv.components.forEach((comp: any) => {
                    output += `**${comp.baseName}** (${comp.variants.length} states):\n`;
                    output += `| Status | Shape | Background | Text | Border |\n`;
                    output += `|--------|-------|------------|------|--------|\n`;
                    comp.variants.forEach((v: any) => {
                        output += `| ${v.status} | ${v.shapeName} | ${v.styles.background || '-'} | ${v.styles.text || '-'} | ${v.styles.border || '-'} |\n`;
                    });
                    output += `\n`;
                });
            }
        }

        // Dimensions
        if (result.checks["dimensions"]) {
            const dims = result.checks["dimensions"];
            output += `### Dimensions\n`;
            
            if (dims.keyDimensions && Object.keys(dims.keyDimensions).length > 0) {
                output += `**Key Fixed Dimensions:**\n`;
                output += `| Component | Width | Height |\n`;
                output += `|-----------|-------|--------|\n`;
                Object.entries(dims.keyDimensions).forEach(([key, dim]: [string, any]) => {
                    output += `| ${key} (${dim.name}) | ${dim.width}px | ${dim.height}px |\n`;
                });
                output += `\n`;
            }

            if (dims.inconsistencies > 0) {
                output += `**⚠️ Dimension Inconsistencies (${dims.inconsistencies}):**\n`;
                dims.details.slice(0, 5).forEach((inc: any) => {
                    output += `- ${inc.baseName}: ${inc.dimensions.join(' vs ')}\n`;
                });
                output += `\n`;
            }
        }

        // Interactive elements
        if (result.checks["interactive-elements"]) {
            const ie = result.checks["interactive-elements"];
            output += `### Interactive Elements\n`;
            output += `Found ${ie.total} interactive elements.\n\n`;

            if (ie.byType && Object.keys(ie.byType).length > 0) {
                output += `| Type | Count | Examples |\n`;
                output += `|------|-------|----------|\n`;
                Object.entries(ie.byType).forEach(([type, elements]: [string, any]) => {
                    const examples = elements.slice(0, 2).map((e: any) => e.name).join(', ');
                    output += `| ${type} | ${elements.length} | ${examples} |\n`;
                });
                output += `\n`;
            }
        }

        // Layout types
        if (result.checks["layout-types"]) {
            const lt = result.checks["layout-types"];
            output += `### Layout Systems\n`;
            output += `| Layout Type | Count |\n`;
            output += `|-------------|-------|\n`;
            output += `| Flex | ${lt.flex} |\n`;
            output += `| Grid | ${lt.grid} |\n`;
            output += `| Absolute | ${lt.absolute} |\n`;
            output += `\n`;

            if (lt.absolute > 0) {
                output += `⚠️ ${lt.absolute} containers use absolute positioning - may require manual pixel values in CSS.\n\n`;
            }
        }

        // Color tokens
        if (result.checks["color-tokens"]) {
            const ct = result.checks["color-tokens"];
            output += `### Color Palette\n`;
            output += `Detected ${ct.uniqueColors} unique colors.\n\n`;

            if (ct.colors && ct.colors.length > 0) {
                output += `**Top Colors by Usage:**\n`;
                output += `| Color | Usage Count | Sample Elements |\n`;
                output += `|-------|-------------|----------------|\n`;
                ct.colors.slice(0, 10).forEach((c: any) => {
                    output += `| \`${c.color}\` | ${c.count} | ${c.sampleUsages.slice(0, 2).join(', ')} |\n`;
                });
                output += `\n`;
            }
        }

        // Implementation checklist
        if (result.checklist && result.checklist.length > 0) {
            output += `## Implementation Checklist\n\n`;
            
            const byCategory: Record<string, any[]> = {};
            result.checklist.forEach((item: any) => {
                if (!byCategory[item.category]) byCategory[item.category] = [];
                byCategory[item.category].push(item);
            });

            Object.entries(byCategory).forEach(([category, items]) => {
                output += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
                items.forEach((item: any) => {
                    output += `- [ ] ${item.item}\n`;
                });
                output += `\n`;
            });
        }

        output += `---\n`;
        output += `*Validation complete. Run \`analyze_design_context\` next to proceed with implementation.*\n`;

        return new TextResponse(output);
    }
}
