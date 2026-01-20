/**
 * Post-processing script to add .js extensions to relative imports in compiled JS files.
 * This is needed for Node.js ESM which requires explicit file extensions.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

/**
 * Add .js extension to relative imports that don't have one
 */
function addJsExtensions(content, filePath) {
    // Match import/export statements with relative paths that don't end in .js
    // Handles: import ... from "./path" or from "../path" or from "../../path" etc.
    const importRegex = /(import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"])(\.[^'"]+)(['"])/g;
    const exportRegex = /(export\s+(?:\{[^}]*\}|\*)\s*from\s*['"])(\.[^'"]+)(['"])/g;
    const dynamicImportRegex = /(import\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g;
    
    const addExtension = (match, prefix, path, suffix) => {
        // Skip if already has .js extension
        if (path.endsWith('.js')) {
            return match;
        }
        // Skip node: and other protocols
        if (!path.startsWith('.')) {
            return match;
        }
        return `${prefix}${path}.js${suffix}`;
    };
    
    let result = content;
    result = result.replace(importRegex, addExtension);
    result = result.replace(exportRegex, addExtension);
    result = result.replace(dynamicImportRegex, addExtension);
    
    return result;
}

/**
 * Process all JS files in a directory recursively
 */
async function processDirectory(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
            await processDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            const content = await readFile(fullPath, 'utf8');
            const modified = addJsExtensions(content, fullPath);
            
            if (content !== modified) {
                await writeFile(fullPath, modified, 'utf8');
                console.log(`Updated: ${relative(distDir, fullPath)}`);
            }
        }
    }
}

// Main execution
console.log('Adding .js extensions to relative imports...');
await processDirectory(distDir);
console.log('Done!');
