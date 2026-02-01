const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const extensionPath = process.argv[2];

if (!extensionPath) {
  console.error('Usage: node tools/build-extension.js <path-to-extension-folder>');
  process.exit(1);
}

const absolutePath = path.resolve(extensionPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: Path not found: ${absolutePath}`);
  process.exit(1);
}

const manifestPath = path.join(absolutePath, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found in the extension directory.');
  process.exit(1);
}

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (!manifest.id || !manifest.version) {
    console.error('Error: manifest.json must contain "id" and "version".');
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), 'dist-extensions');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFilename = `${manifest.id}-${manifest.version}.bcext`;
  const outputPath = path.join(outputDir, outputFilename);

  const zip = new AdmZip();

  const addDirectoryToZip = (dir, zipPath) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (file === 'node_modules' || file === '.git' || file === 'dist' || file.endsWith('.bcext')) {
        continue;
      }

      if (stats.isDirectory()) {
        addDirectoryToZip(filePath, path.join(zipPath, file));
      } else {
        zip.addLocalFile(filePath, zipPath);
      }
    }
  };

  console.log(`Packaging extension: ${manifest.name} v${manifest.version}`);
  console.log(`Source: ${absolutePath}`);

  addDirectoryToZip(absolutePath, '');

  zip.writeZip(outputPath);

  console.log('\n✅ Success! Extension packaged to:');
  console.log(outputPath);
  console.log('\nYou can now distribute this .bcext file.');
} catch (e) {
  console.error('Error processing extension:', e);
  process.exit(1);
}
