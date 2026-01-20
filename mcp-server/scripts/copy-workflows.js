/**
 * Script to copy workflow non-TypeScript files from src to dist.
 * 
 * TypeScript files are compiled by tsc, but YAML and other config files
 * need to be copied manually.
 */

import { cpSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const srcWorkflowsDir = join(rootDir, 'src', 'workflows');
const distWorkflowsDir = join(rootDir, 'dist', 'workflows');

/**
 * Recursively copies files matching a pattern from source to destination.
 */
function copyFilesRecursively(srcDir, destDir, patterns) {
    if (!existsSync(srcDir)) {
        console.log(`Source directory does not exist: ${srcDir}`);
        return;
    }

    if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
    }

    const entries = readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(srcDir, entry.name);
        const destPath = join(destDir, entry.name);

        if (entry.isDirectory()) {
            copyFilesRecursively(srcPath, destPath, patterns);
        } else if (entry.isFile()) {
            // Check if file matches any pattern
            const shouldCopy = patterns.some(pattern => {
                if (pattern instanceof RegExp) {
                    return pattern.test(entry.name);
                }
                return entry.name.endsWith(pattern);
            });

            if (shouldCopy) {
                if (!existsSync(destDir)) {
                    mkdirSync(destDir, { recursive: true });
                }
                cpSync(srcPath, destPath);
                console.log(`Copied: ${relative(rootDir, srcPath)} -> ${relative(rootDir, destPath)}`);
            }
        }
    }
}

// Main execution
console.log('Copying workflow YAML and config files...');
copyFilesRecursively(srcWorkflowsDir, distWorkflowsDir, ['.yml', '.yaml', '.md']);

console.log('\nWorkflow files copied successfully!');
console.log('(TypeScript files are compiled by tsc)');
