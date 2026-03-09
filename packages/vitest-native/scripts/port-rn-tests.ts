#!/usr/bin/env node
/**
 * Ports React Native test files to Vitest format:
 * 1. Strips Flow type annotations
 * 2. Replaces jest.* → vi.*
 * 3. Cleans up Flow directives
 *
 * Usage: bun scripts/port-rn-tests.ts <input-file> <output-file>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import flowRemoveTypes from "flow-remove-types";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: bun scripts/port-rn-tests.ts <input> <output>");
  process.exit(1);
}

let source = readFileSync(inputPath, "utf-8");

// 1. Strip Flow types
source = flowRemoveTypes(source, { all: true }).toString();

// 2. Remove 'use strict' directives
source = source.replace(/^'use strict';\s*\n/gm, "");

// 3. Remove Flow comment directives
source = source.replace(/\s*\/\/\s*\$Flow\w+(\[[\w-]+\])?.*/g, "");
source = source.replace(/\s*\/\*\s*\$Flow\w+.*?\*\//g, "");
source = source.replace(/^\s*\*\s*@flow.*$/gm, "");
source = source.replace(/^\s*\*\s*@format.*$/gm, "");

// 4. Replace jest.* → vi.*
source = source.replace(/\bjest\.fn\b/g, "vi.fn");
source = source.replace(/\bjest\.spyOn\b/g, "vi.spyOn");
source = source.replace(/\bjest\.mock\b/g, "vi.mock");
source = source.replace(/\bjest\.resetModules\b/g, "vi.resetModules");
source = source.replace(/\bjest\.restoreAllMocks\b/g, "vi.restoreAllMocks");

// 5. Clean up empty comment blocks
source = source.replace(/\/\*\*\s*\*\s*Copyright.*?(?:\*\/)/s, "");
source = source.replace(/^\s*\n{3,}/gm, "\n\n");

// 6. Write output
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, source.trim() + "\n");
console.log(`Ported: ${inputPath} → ${outputPath}`);
