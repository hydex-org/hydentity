#!/usr/bin/env node
/**
 * Copy privacycash circuit files to a location included in the serverless bundle.
 * Run this before build on Vercel.
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..', 'node_modules', 'privacycash', 'circuit2');
const DEST_DIR = path.join(__dirname, '..', 'circuit2');

const FILES = ['transaction2.wasm', 'transaction2.zkey'];

console.log('[copy-circuit-files] Source:', SOURCE_DIR);
console.log('[copy-circuit-files] Dest:', DEST_DIR);

// Create destination directory
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
    console.log('[copy-circuit-files] Created directory:', DEST_DIR);
}

// Copy files
for (const file of FILES) {
    const src = path.join(SOURCE_DIR, file);
    const dest = path.join(DEST_DIR, file);

    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        const stats = fs.statSync(dest);
        console.log(`[copy-circuit-files] Copied ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
        console.error(`[copy-circuit-files] ERROR: Source file not found: ${src}`);
        process.exit(1);
    }
}

console.log('[copy-circuit-files] Done!');
