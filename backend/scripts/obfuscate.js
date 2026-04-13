const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const distDir = path.join(__dirname, '..', 'dist');
const srcDir = distDir;

async function obfuscateDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      await obfuscateDirectory(filePath);
    } else if (file.endsWith('.js')) {
      try {
        const code = fs.readFileSync(filePath, 'utf8');
        const result = await minify(code, {
          compress: {
            passes: 2,
          },
          mangle: true,
          output: {
            beautify: false,
          },
        });

        if (result.error) {
          console.error(`Error obfuscating ${filePath}:`, result.error);
        } else {
          fs.writeFileSync(filePath, result.code);
          console.log(`✓ Obfuscated: ${filePath}`);
        }
      } catch (error) {
        console.error(`Failed to obfuscate ${filePath}:`, error.message);
      }
    }
  }
}

obfuscateDirectory(srcDir)
  .then(() => {
    console.log('Obfuscation complete!');
  })
  .catch((error) => {
    console.error('Obfuscation failed:', error);
    process.exit(1);
  });
