#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');

const distDir = path.join(__dirname, 'dist');
const srcFile = path.join(__dirname, 'src', 'server.ts');
const outFile = path.join(distDir, 'server.js');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('🔨 Compiling TypeScript to JavaScript...');

// Step 1: Compile TypeScript to JavaScript
try {
  buildSync({
    entryPoints: [srcFile],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['express', 'cors', 'dotenv', 'axios', 'formidable', 'pkcs11js', 'sharp'],
  });
  console.log('✅ Compilation successful');
} catch (error) {
  console.error('❌ Compilation failed:', error.message);
  process.exit(1);
}

// Step 2: Read compiled file
console.log('🔐 Obfuscating code...');
const compiledCode = fs.readFileSync(outFile, 'utf-8');

// Step 3: Obfuscate the code
const obfuscationResult = JavaScriptObfuscator.obfuscate(compiledCode, {
  compact: true,
  controlFlowFlattening: true,
  deadCodeInjection: true,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
});

// Step 4: Write obfuscated code
fs.writeFileSync(outFile, obfuscationResult.getObfuscatedCode(), 'utf-8');
console.log('✅ Obfuscation successful');
console.log(`📦 Output: ${outFile}`);
