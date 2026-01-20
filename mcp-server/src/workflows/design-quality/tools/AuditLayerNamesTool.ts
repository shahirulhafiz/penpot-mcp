import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Audits layer names for poor naming conventions and suggests improvements.
 * Detects generic names like "Rectangle 47" and suggests better alternatives.
 */
export class AuditLayerNamesTool extends Tool<{
    target: string;
    autoRename?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().describe(
                'Target to audit: "selection" for current selection, "page" for entire page, or a shape ID'
            ),
            autoRename: z.boolean().default(false).describe(
                'If true, automatically applies suggested renames. Default: false (suggestions only)'
            ),
        });
    }

    getToolName(): string {
        return "audit_layer_names";
    }

    getToolDescription(): string {
        return (
            "Audits layer names for poor naming conventions. Detects generic names like 'Rectangle 47' " +
            "and suggests descriptive alternatives based on shape type, context, and hierarchy. " +
            "Use autoRename=true to automatically apply suggestions."
        );
    }

    protected async executeCore(args: {
        target: string;
        autoRename?: boolean;
    }): Promise<ToolResponse> {
        const autoRename = args.autoRename || false;

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

            const autoRename = ${autoRename};

            // Patterns for bad names
            const badNamePatterns = [
                { pattern: /^Rectangle\\s*\\d*$/i, type: 'generic-shape' },
                { pattern: /^Frame\\s*\\d*$/i, type: 'generic-container' },
                { pattern: /^Group\\s*\\d*$/i, type: 'generic-group' },
                { pattern: /^Ellipse\\s*\\d*$/i, type: 'generic-shape' },
                { pattern: /^Path\\s*\\d*$/i, type: 'generic-path' },
                { pattern: /^Board\\s*\\d*$/i, type: 'generic-board' },
                { pattern: /^Component\\s*\\d+$/i, type: 'generic-component' },
                { pattern: /^Text\\s*\\d*$/i, type: 'generic-text' },
                { pattern: /^Image\\s*\\d*$/i, type: 'generic-image' }
            ];

            // Helper to suggest a better name based on shape properties
            const suggestName = (shape) => {
                const type = shape.type;
                
                // For text shapes, use the text content
                if (type === 'text' && 'characters' in shape && shape.characters) {
                    const text = shape.characters.trim();
                    if (text.length > 0 && text.length <= 30) {
                        return text.length > 20 ? text.substring(0, 20) + '...' : text;
                    }
                    return 'Text Label';
                }

                // For boards with flex layout, suggest based on direction
                if (type === 'board' && shape.flex) {
                    const dir = shape.flex.dir;
                    return dir === 'row' ? 'Horizontal Container' : 'Vertical Container';
                }

                // For boards with grid layout
                if (type === 'board' && shape.grid) {
                    return 'Grid Container';
                }

                // Check parent name for context
                let contextHint = '';
                if (shape.parent) {
                    const parentName = shape.parent.name.toLowerCase();
                    if (parentName.includes('button')) contextHint = 'Button ';
                    else if (parentName.includes('card')) contextHint = 'Card ';
                    else if (parentName.includes('header')) contextHint = 'Header ';
                    else if (parentName.includes('footer')) contextHint = 'Footer ';
                    else if (parentName.includes('nav')) contextHint = 'Nav ';
                    else if (parentName.includes('sidebar')) contextHint = 'Sidebar ';
                }

                // Generic suggestions by type
                const suggestions = {
                    'rectangle': contextHint + 'Background',
                    'ellipse': contextHint + 'Icon',
                    'path': contextHint + 'Icon',
                    'board': contextHint + 'Container',
                    'group': contextHint + 'Group',
                    'image': contextHint + 'Image'
                };

                return suggestions[type] || type.charAt(0).toUpperCase() + type.slice(1);
            };

            // Find all shapes with bad names
            const namingIssues = [];
            let renamedCount = 0;

            penpotUtils.findShapes(() => true, targetShape).forEach(shape => {
                for (const { pattern, type } of badNamePatterns) {
                    if (pattern.test(shape.name)) {
                        const suggestion = suggestName(shape);
                        const issue = {
                            shape: {
                                id: shape.id,
                                currentName: shape.name,
                                type: shape.type
                            },
                            problemType: type,
                            suggestion,
                            renamed: false
                        };

                        // Apply rename if autoRename is enabled
                        if (autoRename && suggestion !== shape.name) {
                            shape.name = suggestion;
                            issue.renamed = true;
                            renamedCount++;
                        }

                        namingIssues.push(issue);
                        break; // Only match first pattern
                    }
                }
            });

            // Check for duplicate names
            const nameCount = {};
            penpotUtils.findShapes(() => true, targetShape).forEach(shape => {
                nameCount[shape.name] = (nameCount[shape.name] || 0) + 1;
            });

            const duplicates = Object.entries(nameCount)
                .filter(([name, count]) => count > 1)
                .map(([name, count]) => ({ name, count }));

            // Naming conventions check
            const conventions = {
                titleCase: 0,
                camelCase: 0,
                lowercase: 0,
                uppercase: 0,
                withNumbers: 0
            };

            penpotUtils.findShapes(() => true, targetShape).forEach(shape => {
                const name = shape.name;
                if (/^[A-Z][a-z]+(\\s+[A-Z][a-z]+)*$/.test(name)) conventions.titleCase++;
                else if (/^[a-z]+([A-Z][a-z]+)*$/.test(name)) conventions.camelCase++;
                else if (/^[a-z\\s]+$/.test(name)) conventions.lowercase++;
                else if (/^[A-Z\\s]+$/.test(name)) conventions.uppercase++;
                if (/\\d/.test(name)) conventions.withNumbers++;
            });

            return {
                target: {
                    id: targetShape.id,
                    name: targetShape.name,
                    type: targetShape.type
                },
                autoRenameEnabled: autoRename,
                renamedCount,
                totalIssues: namingIssues.length,
                duplicateNames: duplicates.length,
                issues: namingIssues,
                duplicates,
                namingConventions: conventions
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`❌ Layer name audit failed: ${result.error}`);
        }

        // Format the results
        let output = `# Layer Naming Audit Results\n\n`;
        output += `**Target:** ${result.target.name} (${result.target.type})\n`;
        output += `**Issues Found:** ${result.totalIssues}\n`;
        output += `**Duplicate Names:** ${result.duplicateNames}\n`;
        
        if (result.autoRenameEnabled) {
            output += `**Auto-Rename:** ENABLED - Renamed ${result.renamedCount} layers\n`;
        } else {
            output += `**Auto-Rename:** DISABLED (suggestions only)\n`;
        }
        output += `\n`;

        if (result.totalIssues === 0 && result.duplicateNames === 0) {
            output += `✅ **All layers have descriptive names!** No issues found.\n`;
        } else {
            // Show naming issues
            if (result.totalIssues > 0) {
                output += `## Poorly Named Layers (${result.totalIssues})\n\n`;
                
                // Group by problem type
                const byType: { [key: string]: any[] } = {};
                result.issues.forEach((issue: any) => {
                    if (!byType[issue.problemType]) {
                        byType[issue.problemType] = [];
                    }
                    byType[issue.problemType].push(issue);
                });

                Object.entries(byType).forEach(([type, issues]) => {
                    output += `### ${type.replace(/-/g, ' ').toUpperCase()} (${issues.length})\n\n`;
                    output += `| Current Name | Type | Suggested Name | Status |\n`;
                    output += `|--------------|------|----------------|--------|\n`;
                    
                    issues.slice(0, 20).forEach((issue: any) => {
                        const status = issue.renamed ? '✅ Renamed' : '💡 Suggestion';
                        output += `| ${issue.shape.currentName} | ${issue.shape.type} | ${issue.suggestion} | ${status} |\n`;
                    });
                    
                    if (issues.length > 20) {
                        output += `\n*...and ${issues.length - 20} more*\n`;
                    }
                    output += `\n`;
                });
            }

            // Show duplicates
            if (result.duplicates.length > 0) {
                output += `## Duplicate Names (${result.duplicateNames})\n\n`;
                output += `These names appear multiple times, which can cause confusion:\n\n`;
                output += `| Name | Count |\n`;
                output += `|------|-------|\n`;
                result.duplicates.slice(0, 20).forEach((dup: any) => {
                    output += `| ${dup.name} | ${dup.count} |\n`;
                });
                if (result.duplicates.length > 20) {
                    output += `\n*...and ${result.duplicates.length - 20} more*\n`;
                }
                output += `\n`;
            }

            // Show naming convention stats
            output += `## Naming Convention Analysis\n\n`;
            output += `| Convention | Count |\n`;
            output += `|------------|-------|\n`;
            output += `| Title Case (recommended) | ${result.namingConventions.titleCase} |\n`;
            output += `| camelCase | ${result.namingConventions.camelCase} |\n`;
            output += `| lowercase | ${result.namingConventions.lowercase} |\n`;
            output += `| UPPERCASE | ${result.namingConventions.uppercase} |\n`;
            output += `| Contains Numbers | ${result.namingConventions.withNumbers} |\n\n`;

            if (!result.autoRenameEnabled && result.totalIssues > 0) {
                output += `\n💡 **Tip:** Run again with \`autoRename: true\` to automatically apply these suggestions.\n`;
            }

            output += `\n## Naming Best Practices\n\n`;
            output += `- Use **Title Case** for layer names (e.g., "Submit Button", "User Card")\n`;
            output += `- Be **descriptive** - avoid generic names like "Rectangle 47"\n`;
            output += `- Include **context** - "Header Logo" is better than just "Logo"\n`;
            output += `- For variants, use **Base + Variant** pattern (e.g., "Button Primary", "Button Secondary")\n`;
        }

        return new TextResponse(output);
    }
}
