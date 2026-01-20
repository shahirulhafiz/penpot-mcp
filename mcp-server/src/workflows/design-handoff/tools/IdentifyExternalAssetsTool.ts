import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";
import { ICON_FONT_PATTERNS } from "./HandoffContext.js";

/**
 * Identifies external dependencies (fonts, icon fonts, images) needed for implementation.
 */
export class IdentifyExternalAssetsTool extends Tool<{
    target: string;
    detectIconFonts?: boolean;
    detectWebFonts?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to analyze: "selection", "page", "context" (use stored context), or a shape ID'
            ),
            detectIconFonts: z.boolean().optional().describe(
                'Detect Material Symbols, FontAwesome, etc. from text content. Default: true'
            ),
            detectWebFonts: z.boolean().optional().describe(
                'Detect Google Fonts, Adobe Fonts from typography. Default: true'
            ),
        });
    }

    getToolName(): string {
        return "identify_external_assets";
    }

    getToolDescription(): string {
        return (
            "Identifies external dependencies needed for implementation: web fonts, icon fonts, and images. " +
            "Generates ready-to-use HTML imports and detects icon font usage from text content. " +
            "Critical for avoiding missing font/icon issues."
        );
    }

    protected async executeCore(args: {
        target: string;
        detectIconFonts?: boolean;
        detectWebFonts?: boolean;
    }): Promise<ToolResponse> {
        const detectIconFonts = args.detectIconFonts ?? true;
        const detectWebFonts = args.detectWebFonts ?? true;

        // Serialize icon patterns
        const iconPatternsObj: Record<string, { pattern: string; library: string; importUrl: string; usage: string }> = {};
        for (const [key, value] of Object.entries(ICON_FONT_PATTERNS)) {
            iconPatternsObj[key] = {
                pattern: value.pattern.source,
                library: value.library,
                importUrl: value.importUrl,
                usage: value.usage
            };
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

            const detectIconFonts = ${detectIconFonts};
            const detectWebFonts = ${detectWebFonts};
            const iconPatterns = ${JSON.stringify(iconPatternsObj)};

            // Collections
            const fonts = new Map();         // fontFamily -> { weights: Set, usedIn: [] }
            const detectedIcons = new Map(); // library -> { icons: Set, pattern: object }
            const images = [];

            /**
             * Common web fonts that need imports
             */
            const webFonts = {
                'source sans 3': {
                    name: 'Source Sans 3',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Source+Sans+3'
                },
                'source sans pro': {
                    name: 'Source Sans Pro',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro'
                },
                'inter': {
                    name: 'Inter',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Inter'
                },
                'roboto': {
                    name: 'Roboto',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Roboto'
                },
                'open sans': {
                    name: 'Open Sans',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Open+Sans'
                },
                'lato': {
                    name: 'Lato',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Lato'
                },
                'montserrat': {
                    name: 'Montserrat',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Montserrat'
                },
                'poppins': {
                    name: 'Poppins',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Poppins'
                },
                'nunito': {
                    name: 'Nunito',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Nunito'
                },
                'raleway': {
                    name: 'Raleway',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=Raleway'
                },
                'dm sans': {
                    name: 'DM Sans',
                    source: 'Google Fonts',
                    importBase: 'https://fonts.googleapis.com/css2?family=DM+Sans'
                }
            };

            /**
             * Check if text content matches icon font patterns
             */
            function checkIconPattern(text) {
                if (!detectIconFonts || !text || text.length > 50) return null;
                
                const trimmed = text.trim().toLowerCase();
                
                for (const [key, config] of Object.entries(iconPatterns)) {
                    const regex = new RegExp(config.pattern, 'i');
                    if (regex.test(trimmed)) {
                        return {
                            library: key,
                            icon: trimmed,
                            config: config
                        };
                    }
                }
                return null;
            }

            /**
             * Analyze shape for assets
             */
            function analyzeShape(shape) {
                // Check fonts
                if (shape.type === 'text' && shape.fontFamily) {
                    const fontKey = shape.fontFamily.toLowerCase();
                    
                    if (!fonts.has(fontKey)) {
                        const webFont = webFonts[fontKey];
                        fonts.set(fontKey, {
                            family: shape.fontFamily,
                            weights: new Set(),
                            usedIn: [],
                            isWebFont: !!webFont,
                            webFontInfo: webFont || null
                        });
                    }
                    
                    const fontInfo = fonts.get(fontKey);
                    if (shape.fontWeight) {
                        fontInfo.weights.add(shape.fontWeight);
                    }
                    if (!fontInfo.usedIn.includes(shape.name)) {
                        fontInfo.usedIn.push(shape.name);
                    }

                    // Check if text content is an icon name
                    if ('characters' in shape && shape.characters) {
                        const iconMatch = checkIconPattern(shape.characters);
                        if (iconMatch) {
                            if (!detectedIcons.has(iconMatch.library)) {
                                detectedIcons.set(iconMatch.library, {
                                    icons: new Set(),
                                    config: iconMatch.config
                                });
                            }
                            detectedIcons.get(iconMatch.library).icons.add(iconMatch.icon);
                        }
                    }
                }

                // Check for images
                if ('fills' in shape && shape.fills) {
                    for (const fill of shape.fills) {
                        if (fill.fillImage) {
                            images.push({
                                name: shape.name,
                                id: shape.id,
                                dimensions: {
                                    width: Math.round(fill.fillImage.width || shape.width),
                                    height: Math.round(fill.fillImage.height || shape.height)
                                }
                            });
                        }
                    }
                }

                // Legacy image type
                if (shape.type === 'image') {
                    images.push({
                        name: shape.name,
                        id: shape.id,
                        dimensions: {
                            width: Math.round(shape.width),
                            height: Math.round(shape.height)
                        }
                    });
                }

                // Recurse
                if ('children' in shape && shape.children) {
                    shape.children.forEach(analyzeShape);
                }
            }

            // Analyze the design
            analyzeShape(targetShape);

            // Convert fonts Map to array
            const fontArray = Array.from(fonts.values()).map(f => ({
                family: f.family,
                weights: Array.from(f.weights).sort((a, b) => Number(a) - Number(b)),
                usedIn: f.usedIn,
                isWebFont: f.isWebFont,
                source: f.webFontInfo?.source || 'Local/System',
                importUrl: f.webFontInfo ? 
                    f.webFontInfo.importBase + ':wght@' + Array.from(f.weights).join(';') + '&display=swap' : null
            }));

            // Convert icons Map to array
            const iconArray = Array.from(detectedIcons.entries()).map(([lib, data]) => ({
                library: data.config.library,
                icons: Array.from(data.icons),
                importUrl: data.config.importUrl,
                usagePattern: data.config.usage
            }));

            // Store in context
            if (!storage.handoffContext) {
                storage.handoffContext = {};
            }
            storage.handoffContext.assets = {
                fonts: fontArray.filter(f => f.isWebFont),
                iconFonts: iconArray,
                images: images
            };

            return {
                target: targetShape.name,
                fonts: fontArray,
                iconFonts: iconArray,
                images: images,
                summary: {
                    totalFonts: fontArray.length,
                    webFonts: fontArray.filter(f => f.isWebFont).length,
                    iconLibraries: iconArray.length,
                    totalIcons: iconArray.reduce((sum, lib) => sum + lib.icons.length, 0),
                    images: images.length
                }
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`Error: ${result.error}`);
        }

        // Format output
        let output = `# External Assets\n\n`;
        output += `**Target:** ${result.target}\n\n`;

        output += `## Summary\n\n`;
        output += `| Category | Count |\n`;
        output += `|----------|-------|\n`;
        output += `| Fonts (total) | ${result.summary.totalFonts} |\n`;
        output += `| Web Fonts | ${result.summary.webFonts} |\n`;
        output += `| Icon Libraries | ${result.summary.iconLibraries} |\n`;
        output += `| Total Icons | ${result.summary.totalIcons} |\n`;
        output += `| Images | ${result.summary.images} |\n\n`;

        // Web Fonts
        const webFonts = result.fonts.filter((f: any) => f.isWebFont);
        if (webFonts.length > 0) {
            output += `## Web Fonts\n\n`;
            for (const font of webFonts) {
                output += `### ${font.family}\n\n`;
                output += `- **Source:** ${font.source}\n`;
                output += `- **Weights:** ${font.weights.join(', ')}\n`;
                output += `- **Used in:** ${font.usedIn.slice(0, 3).join(', ')}${font.usedIn.length > 3 ? '...' : ''}\n\n`;
            }
        }

        // Icon Fonts
        if (result.iconFonts.length > 0) {
            output += `## Icon Fonts\n\n`;
            for (const iconLib of result.iconFonts) {
                output += `### ${iconLib.library}\n\n`;
                output += `**Detected Icons:** ${iconLib.icons.join(', ')}\n\n`;
                output += `**Usage Pattern:**\n`;
                output += "```html\n";
                output += iconLib.usagePattern + "\n";
                output += "```\n\n";
            }

            output += `> **Important:** Icon fonts use the icon NAME as text content, not the visual symbol.\n`;
            output += `> For example: \`<span class="material-symbols-outlined">chevron_left</span>\`\n`;
            output += `> NOT: \`<span class="material-symbols-outlined"><</span>\`\n\n`;
        }

        // Images
        if (result.images.length > 0) {
            output += `## Images\n\n`;
            output += `| Name | Dimensions | Notes |\n`;
            output += `|------|------------|-------|\n`;
            for (const img of result.images) {
                output += `| ${img.name} | ${img.dimensions.width}×${img.dimensions.height} | Consider dynamic loading |\n`;
            }
            output += `\n`;
        }

        // Ready-to-use HTML
        output += `## Ready-to-Use HTML Imports\n\n`;
        output += `Add this to your \`index.html\` \`<head>\`:\n\n`;
        output += "```html\n";
        output += `<!-- Fonts -->\n`;
        output += `<link rel="preconnect" href="https://fonts.googleapis.com">\n`;
        output += `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n`;
        
        for (const font of webFonts) {
            if (font.importUrl) {
                output += `<link href="${font.importUrl}" rel="stylesheet">\n`;
            }
        }

        for (const iconLib of result.iconFonts) {
            output += `<!-- ${iconLib.library} -->\n`;
            if (iconLib.importUrl.endsWith('.css')) {
                output += `<link href="${iconLib.importUrl}" rel="stylesheet">\n`;
            } else if (iconLib.importUrl.endsWith('.js')) {
                output += `<script src="${iconLib.importUrl}"></script>\n`;
            } else {
                output += `<link href="${iconLib.importUrl}" rel="stylesheet">\n`;
            }
        }

        output += "```\n\n";

        output += `---\n`;
        output += `*Assets saved to context. Run \`generate_implementation_guide\` for complete documentation.*\n`;

        return new TextResponse(output);
    }
}
