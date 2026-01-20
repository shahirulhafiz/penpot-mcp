import { z } from "zod";
import { Tool } from "../../../Tool.js";
import { PenpotMcpServer } from "../../../PenpotMcpServer.js";
import { ToolResponse, TextResponse } from "../../../ToolResponse.js";
import { ExecuteCodePluginTask } from "../../core/tasks/ExecuteCodePluginTask.js";

/**
 * Generates comprehensive developer documentation by combining all extracted data
 * from the handoff workflow.
 */
export class GenerateImplementationGuideTool extends Tool<{
    target?: string;
    framework: string;
    includeCodeSamples?: boolean;
}> {
    constructor(mcpServer: PenpotMcpServer) {
        super(mcpServer, {
            target: z.string().optional().describe(
                'Target shape (optional if context exists from previous tools)'
            ),
            framework: z.enum(["vue", "react", "angular", "svelte", "html", "generic"]).describe(
                'Target framework for code samples'
            ),
            includeCodeSamples: z.boolean().optional().describe(
                'Generate starter code samples. Default: true'
            ),
        });
    }

    getToolName(): string {
        return "generate_implementation_guide";
    }

    getToolDescription(): string {
        return (
            "Generates comprehensive developer documentation combining all extracted design data. " +
            "Includes setup checklist, component structure, state management hints, and framework-specific code samples. " +
            "Run this as the final step in the handoff workflow."
        );
    }

    protected async executeCore(args: {
        target?: string;
        framework: string;
        includeCodeSamples?: boolean;
    }): Promise<ToolResponse> {
        const includeCodeSamples = args.includeCodeSamples ?? true;

        const code = `
            // Check for context
            const context = storage.handoffContext || {};
            
            if (!context.targetId && !${JSON.stringify(args.target)}) {
                return { error: "No context found. Run the handoff workflow tools first, or specify a target." };
            }

            return {
                hasContext: true,
                targetName: context.targetName || 'Design',
                structure: context.structure || null,
                tokens: context.tokens || null,
                states: context.states || null,
                assets: context.assets || null
            };
        `;

        const task = new ExecuteCodePluginTask({ code });
        const taskResult = await this.mcpServer.pluginBridge.executePluginTask(task);
        const result = taskResult.data?.result;

        if (result?.error) {
            return new TextResponse(`Error: ${result.error}`);
        }

        // Generate the guide
        const guide = this.generateGuide(result, args.framework, includeCodeSamples);
        return new TextResponse(guide);
    }

    private generateGuide(data: any, framework: string, includeCodeSamples: boolean): string {
        let output = `# Implementation Guide: ${data.targetName}\n\n`;
        output += `**Framework:** ${framework}\n`;
        output += `**Generated:** ${new Date().toISOString().split('T')[0]}\n\n`;

        // Quick Start Checklist
        output += `## Quick Start Checklist\n\n`;
        output += `- [ ] Add font imports to index.html\n`;
        if (data.tokens?.colors?.length > 0) {
            output += `- [ ] Configure design tokens in your styling system\n`;
        }
        if (data.structure) {
            output += `- [ ] Create component structure following the hierarchy\n`;
        }
        if (data.states?.components?.length > 0) {
            output += `- [ ] Implement state management for interactive components\n`;
        }
        output += `- [ ] Apply conditional styling for component states\n`;
        output += `- [ ] Test responsive behavior\n\n`;

        // External Dependencies
        if (data.assets) {
            output += `## 1. External Dependencies\n\n`;
            output += `### Add to index.html\n\n`;
            output += "```html\n";
            output += `<link rel="preconnect" href="https://fonts.googleapis.com">\n`;
            output += `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n`;

            if (data.assets.fonts) {
                for (const font of data.assets.fonts) {
                    if (font.importUrl) {
                        output += `<link href="${font.importUrl}" rel="stylesheet">\n`;
                    }
                }
            }

            if (data.assets.iconFonts) {
                for (const iconLib of data.assets.iconFonts) {
                    output += `<!-- ${iconLib.library} -->\n`;
                    output += `<link href="${iconLib.importUrl}" rel="stylesheet">\n`;
                }
            }

            output += "```\n\n";
        }

        // Design Tokens
        if (data.tokens) {
            output += `## 2. Design Tokens\n\n`;
            output += this.generateTokensSection(data.tokens, framework);
        }

        // Component Structure
        if (data.structure) {
            output += `## 3. Component Structure\n\n`;
            output += this.generateComponentStructure(data.structure, framework);
        }

        // State Management
        if (data.states?.components?.length > 0) {
            output += `## 4. State Management\n\n`;
            output += this.generateStateManagement(data.states.components, framework, includeCodeSamples);
        }

        // Conditional Styling Reference
        if (data.states?.components?.length > 0) {
            output += `## 5. Conditional Styling Reference\n\n`;
            output += this.generateStylingReference(data.states.components);
        }

        // Icon Usage
        if (data.assets?.iconFonts?.length > 0) {
            output += `## 6. Icon Usage\n\n`;
            output += this.generateIconUsage(data.assets.iconFonts);
        }

        // Common Pitfalls
        output += `## 7. Common Pitfalls\n\n`;
        output += this.generatePitfalls(framework, data);

        return output;
    }

    private generateTokensSection(tokens: any, framework: string): string {
        let output = '';

        if (framework === 'vue' || framework === 'react' || framework === 'svelte') {
            output += `### For Tailwind CSS v4\n\n`;
            output += "```css\n";
            output += `@import 'tailwindcss';\n\n`;
            output += `@theme {\n`;

            if (tokens.colors) {
                output += `  /* Colors */\n`;
                for (const color of tokens.colors.slice(0, 15)) {
                    output += `  --color-${color.semanticName}: ${color.value};\n`;
                }
            }

            if (tokens.spacing) {
                output += `\n  /* Spacing */\n`;
                for (const sp of tokens.spacing.slice(0, 10)) {
                    output += `  --spacing-${sp.value}: ${sp.value}px;\n`;
                }
            }

            if (tokens.borderRadius) {
                output += `\n  /* Border Radius */\n`;
                for (const br of tokens.borderRadius.slice(0, 6)) {
                    output += `  --radius-${br.value}: ${br.value}px;\n`;
                }
            }

            output += `}\n\n`;

            // Fallback for v4 compatibility
            output += `/* IMPORTANT: Add fallback utility classes for Tailwind v4 compatibility */\n`;
            output += `:root {\n`;
            if (tokens.colors) {
                for (const color of tokens.colors.slice(0, 15)) {
                    output += `  --color-${color.semanticName}: ${color.value};\n`;
                }
            }
            output += `}\n\n`;

            if (tokens.colors) {
                for (const color of tokens.colors.slice(0, 10)) {
                    output += `.bg-${color.semanticName} { background-color: var(--color-${color.semanticName}); }\n`;
                    output += `.text-${color.semanticName} { color: var(--color-${color.semanticName}); }\n`;
                    output += `.border-${color.semanticName} { border-color: var(--color-${color.semanticName}); }\n`;
                }
            }

            output += "```\n\n";
        } else {
            // Generic CSS
            output += `### CSS Custom Properties\n\n`;
            output += "```css\n";
            output += `:root {\n`;

            if (tokens.colors) {
                for (const color of tokens.colors.slice(0, 15)) {
                    output += `  --color-${color.semanticName}: ${color.value};\n`;
                }
            }

            output += `}\n`;
            output += "```\n\n";
        }

        return output;
    }

    private generateComponentStructure(structure: any, framework: string): string {
        let output = '';

        // Generate folder structure
        output += `### Suggested File Structure\n\n`;
        output += "```\n";
        output += `src/\n`;
        output += `├── components/\n`;

        const componentNames = this.extractComponentNames(structure, 0, 3);
        for (const name of componentNames.slice(0, 8)) {
            const ext = framework === 'vue' ? '.vue' : framework === 'react' ? '.tsx' : framework === 'svelte' ? '.svelte' : '.ts';
            output += `│   ├── ${this.toPascalCase(name)}${ext}\n`;
        }

        if (framework === 'vue' || framework === 'react') {
            output += `├── composables/  # or hooks/\n`;
            output += `│   └── useComponentLogic.ts\n`;
        }

        output += `├── styles/\n`;
        output += `│   └── tokens.css\n`;
        output += `└── views/\n`;
        output += `    └── MainView${framework === 'vue' ? '.vue' : framework === 'react' ? '.tsx' : '.ts'}\n`;
        output += "```\n\n";

        // Component hierarchy
        output += `### Component Hierarchy\n\n`;
        output += this.formatHierarchy(structure, 0, 3);

        return output;
    }

    private extractComponentNames(node: any, depth: number, maxDepth: number): string[] {
        const names: string[] = [];

        if (node.semanticType || (node.layout && node.layout.type !== 'none')) {
            names.push(node.name);
        }

        if (depth < maxDepth && node.children) {
            for (const child of node.children) {
                names.push(...this.extractComponentNames(child, depth + 1, maxDepth));
            }
        }

        return names;
    }

    private formatHierarchy(node: any, depth: number, maxDepth: number): string {
        if (depth > maxDepth) return '';

        const indent = '  '.repeat(depth);
        let output = `${indent}- **${node.name}**`;

        if (node.semanticType) {
            output += ` (${node.semanticType})`;
        }
        if (node.layout && node.layout.type !== 'none') {
            output += ` 📐 ${node.layout.type}`;
        }
        output += `\n`;

        if (node.children && depth < maxDepth) {
            for (const child of node.children.slice(0, 6)) {
                output += this.formatHierarchy(child, depth + 1, maxDepth);
            }
            if (node.children.length > 6) {
                output += `${indent}  - ... and ${node.children.length - 6} more\n`;
            }
        }

        return output;
    }

    private generateStateManagement(components: any[], framework: string, includeCodeSamples: boolean): string {
        let output = '';

        if (!includeCodeSamples) {
            output += `Implement state management for the following interactive components:\n\n`;
            for (const comp of components) {
                output += `- **${comp.componentName}**: ${comp.variants.map((v: any) => v.state).join(', ')}\n`;
            }
            return output + '\n';
        }

        // Generate framework-specific code
        if (framework === 'vue') {
            output += `### Vue 3 Composable Example\n\n`;
            output += "```typescript\n";
            output += `// composables/useComponentState.ts\n`;
            output += `import { ref, computed } from 'vue';\n\n`;
            output += `export function useComponentState() {\n`;

            for (const comp of components.slice(0, 3)) {
                const varName = this.toCamelCase(comp.componentName);
                const states = comp.variants.map((v: any) => `'${v.state}'`).join(' | ');
                output += `  const ${varName}State = ref<${states}>('${comp.variants[0]?.state || 'default'}');\n`;
            }

            output += `\n  return {\n`;
            for (const comp of components.slice(0, 3)) {
                const varName = this.toCamelCase(comp.componentName);
                output += `    ${varName}State,\n`;
            }
            output += `  };\n`;
            output += `}\n`;
            output += "```\n\n";

        } else if (framework === 'react') {
            output += `### React Hook Example\n\n`;
            output += "```typescript\n";
            output += `// hooks/useComponentState.ts\n`;
            output += `import { useState } from 'react';\n\n`;

            for (const comp of components.slice(0, 3)) {
                const varName = this.toCamelCase(comp.componentName);
                const states = comp.variants.map((v: any) => `'${v.state}'`).join(' | ');
                output += `type ${this.toPascalCase(comp.componentName)}State = ${states};\n`;
            }

            output += `\nexport function useComponentState() {\n`;

            for (const comp of components.slice(0, 3)) {
                const varName = this.toCamelCase(comp.componentName);
                const pascalName = this.toPascalCase(comp.componentName);
                output += `  const [${varName}State, set${pascalName}State] = useState<${pascalName}State>('${comp.variants[0]?.state || 'default'}');\n`;
            }

            output += `\n  return {\n`;
            for (const comp of components.slice(0, 3)) {
                const varName = this.toCamelCase(comp.componentName);
                const pascalName = this.toPascalCase(comp.componentName);
                output += `    ${varName}State, set${pascalName}State,\n`;
            }
            output += `  };\n`;
            output += `}\n`;
            output += "```\n\n";

        } else {
            output += `### State Variables\n\n`;
            for (const comp of components) {
                const states = comp.variants.map((v: any) => `'${v.state}'`).join(' | ');
                output += `- \`${this.toCamelCase(comp.componentName)}State\`: ${states}\n`;
            }
            output += '\n';
        }

        return output;
    }

    private generateStylingReference(components: any[]): string {
        let output = '';

        for (const comp of components.slice(0, 5)) {
            output += `### ${comp.componentName}\n\n`;
            output += `| State | Background | Text | Border | Other |\n`;
            output += `|-------|------------|------|--------|-------|\n`;

            for (const variant of comp.variants) {
                const styles = variant.styles || {};
                output += `| ${variant.state} | ${styles.background || '-'} | ${styles.textColor || '-'} | ${styles.borderColor ? styles.borderWidth + 'px ' + styles.borderColor : '-'} | ${styles.shadow ? 'shadow' : '-'} |\n`;
            }
            output += `\n`;

            // CSS classes example
            output += `**CSS Classes:**\n\n`;
            output += "```css\n";
            const baseName = comp.componentName.toLowerCase().replace(/\s+/g, '-');

            for (const variant of comp.variants) {
                const styles = variant.styles || {};
                output += `.${baseName}--${variant.state} {\n`;
                if (styles.background) output += `  background-color: ${styles.background};\n`;
                if (styles.textColor) output += `  color: ${styles.textColor};\n`;
                if (styles.borderColor) output += `  border: ${styles.borderWidth || 1}px solid ${styles.borderColor};\n`;
                if (styles.borderRadius) output += `  border-radius: ${styles.borderRadius}px;\n`;
                output += `}\n\n`;
            }
            output += "```\n\n";
        }

        return output;
    }

    private generateIconUsage(iconFonts: any[]): string {
        let output = '';

        for (const lib of iconFonts) {
            output += `### ${lib.library}\n\n`;
            output += `**Usage Pattern:**\n\n`;
            output += "```html\n";
            output += `${lib.usagePattern}\n`;
            output += "```\n\n";

            output += `**Detected Icons:** ${lib.icons.join(', ')}\n\n`;

            output += `> **IMPORTANT:** Use the icon NAME as text content, not the visual symbol.\n`;
            output += `> Example: \`chevron_left\` not \`<\`\n\n`;
        }

        return output;
    }

    private generatePitfalls(framework: string, data: any): string {
        let output = '';

        output += `1. **Tailwind v4 @theme Directive**\n`;
        output += `   - The \`@theme\` directive generates CSS custom properties\n`;
        output += `   - Utility classes may not auto-generate for custom tokens\n`;
        output += `   - **Solution:** Add explicit utility classes as fallback (see tokens section)\n\n`;

        output += `2. **Icon Fonts**\n`;
        output += `   - Icon fonts use the icon NAME as text content\n`;
        output += `   - \`<span class="material-symbols-outlined">chevron_left</span>\` (correct)\n`;
        output += `   - \`<span class="material-symbols-outlined"><</span>\` (wrong!)\n\n`;

        if (data.states?.components?.length > 0) {
            output += `3. **State Styling**\n`;
            output += `   - Don't hardcode hex colors in templates\n`;
            output += `   - Use CSS classes or design token variables\n`;
            output += `   - Implement state as props for reusability\n\n`;
        }

        output += `4. **Font Loading**\n`;
        output += `   - Add \`<link rel="preconnect">\` for performance\n`;
        output += `   - Include all required font weights\n`;
        output += `   - Test with slow network to ensure fonts load correctly\n\n`;

        if (framework === 'vue' || framework === 'react') {
            output += `5. **Component Composition**\n`;
            output += `   - Create small, reusable components\n`;
            output += `   - Use slots/children for content customization\n`;
            output += `   - Keep styling logic in CSS, not JavaScript\n\n`;
        }

        return output;
    }

    private toPascalCase(str: string): string {
        return str
            .split(/[\s_-]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    private toCamelCase(str: string): string {
        const pascal = this.toPascalCase(str);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }
}
