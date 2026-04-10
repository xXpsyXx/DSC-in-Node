#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, 'dist');
const releaseDir = path.join(__dirname, 'release');
const outFile = path.join(distDir, 'server.js');

// Create release directory if it doesn't exist
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

console.log('📦 Packaging application with pkg...\n');

// PKG build targets
const targets = [
  'win',      // Windows executable
  'linux',    // Linux executable
  'macos'     // macOS executable
];

targets.forEach((target) => {
  console.log(`🔨 Building for ${target}...`);
  
  try {
    const cmd = `npx pkg ${outFile} --target node18-${target} --output "${releaseDir}/dsc-signer-${target === 'win' ? 'win.exe' : target === 'linux' ? 'linux' : 'macos'}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✅ ${target} build successful\n`);
  } catch (error) {
    console.error(`❌ ${target} build failed:`, error.message);
  }
});

console.log(`\n📁 Executables created in: ${releaseDir}`);
console.log('\n📋 Available files:');
if (fs.existsSync(releaseDir)) {
  fs.readdirSync(releaseDir).forEach(file => {
    const filePath = path.join(releaseDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   📄 ${file} (${sizeMB} MB)`);
  });
}

console.log('\n✨ Done! Your application is ready for deployment.');
