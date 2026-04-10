#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { minify } from 'terser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

async function obfuscateDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      await obfuscateDir(filePath);
    } else if (file.endsWith('.js')) {
      try {
        const code = fs.readFileSync(filePath, 'utf8');
        const result = await minify(code, {
          compress: {
            passes: 2,
            dead_code: true,
            drop_console: false,
            toplevel: true,
          },
          mangle: {
            toplevel: true,
            properties: {
              regex: /^_/,
            },
          },
          output: {
            beautify: false,
          },
        });

        if (result.error) {
          console.error(`Error obfuscating ${filePath}:`, result.error);
          process.exit(1);
        }

        fs.writeFileSync(filePath, result.code, 'utf8');
        console.log(`✓ Obfuscated: ${filePath}`);
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        process.exit(1);
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error(`dist directory not found: ${distDir}`);
    process.exit(1);
  }

  console.log(`Starting obfuscation of ${distDir}...`);
  await obfuscateDir(distDir);
  console.log('Obfuscation completed successfully!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
