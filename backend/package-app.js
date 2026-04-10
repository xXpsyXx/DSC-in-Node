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
  'win', // Windows executable
  'linux', // Linux executable
  'macos', // macOS executable
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

// Copy helper files to release directory
console.log('\n📋 Copying helper files...');
const helperFiles = [
  {
    src: path.join(__dirname, 'release', 'run.bat'),
    dest: path.join(releaseDir, 'run.bat'),
  },
  {
    src: path.join(__dirname, 'release', 'diagnose.ps1'),
    dest: path.join(releaseDir, 'diagnose.ps1'),
  },
  {
    src: path.join(__dirname, 'release', 'INSTALLATION.md'),
    dest: path.join(releaseDir, 'INSTALLATION.md'),
  },
  {
    src: path.join(__dirname, 'release', '.env'),
    dest: path.join(releaseDir, '.env'),
  },
  {
    src: path.join(__dirname, 'service-install.js'),
    dest: path.join(releaseDir, 'service-install.js'),
  },
  {
    src: path.join(__dirname, 'service-uninstall.js'),
    dest: path.join(releaseDir, 'service-uninstall.js'),
  },
];

helperFiles.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    try {
      fs.copyFileSync(src, dest);
      console.log(`   ✓ ${path.basename(dest)}`);
    } catch (error) {
      console.error(
        `   ✗ Failed to copy ${path.basename(dest)}: ${error.message}`,
      );
    }
  }
});

console.log('\n📋 Distribution files:');
if (fs.existsSync(releaseDir)) {
  fs.readdirSync(releaseDir)
    .sort()
    .forEach((file) => {
      const filePath = path.join(releaseDir, file);
      const stats = fs.statSync(filePath);
      const size =
        stats.size > 1024 * 1024
          ? (stats.size / 1024 / 1024).toFixed(2) + ' MB'
          : (stats.size / 1024).toFixed(2) + ' KB';
      console.log(`   📄 ${file} (${size})`);
    });
}

console.log('\n✨ Done! Your application is ready for distribution.');
console.log('\n📦 Distribution Package:');
console.log(
  '   All files in the release/ directory can be ZIP and distributed',
);
console.log('   Users should extract and run: run.bat (or double-click .exe)');
