#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function parseArgs(args) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, inlineValue] = arg.slice(2).split('=');
      if (inlineValue !== undefined) {
        options[key] = inlineValue;
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          options[key] = next;
          i += 1;
        } else {
          options[key] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }

  return { options, positionals };
}

function titleCase(input) {
  return input
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function printHelp() {
  console.log(`ByteCode Extension CLI (bcext)

Usage:
  bcext init <dir> [--id <id>] [--name <name>] [--version <version>] [--main <file>] [--force]
  bcext validate <dir>
  bcext build <dir> [--out <dir>]

Examples:
  bcext init my-extension --id my-extension --name "My Extension"
  bcext validate ./my-extension
  bcext build ./my-extension
`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFileSafe(filePath, content, force) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`File already exists: ${filePath} (use --force to overwrite)`);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function readManifest(extensionDir) {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found in extension directory.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return { manifest, manifestPath };
}

function validateExtension(extensionDir) {
  const errors = [];

  try {
    const { manifest } = readManifest(extensionDir);

    if (!manifest.id) errors.push('manifest.json is missing "id"');
    if (!manifest.name) errors.push('manifest.json is missing "name"');
    if (!manifest.version) errors.push('manifest.json is missing "version"');
    if (!manifest.main) errors.push('manifest.json is missing "main"');

    if (manifest.main) {
      const mainPath = path.join(extensionDir, manifest.main);
      if (!fs.existsSync(mainPath)) {
        errors.push(`main file not found: ${manifest.main}`);
      }
    }

    return { manifest, errors };
  } catch (error) {
    errors.push(error.message);
    return { manifest: null, errors };
  }
}

function commandInit(args) {
  const { options, positionals } = parseArgs(args);
  const target = positionals[0] || '.';
  const extensionDir = path.resolve(target);
  const force = Boolean(options.force);

  ensureDir(extensionDir);

  const id = options.id || path.basename(extensionDir);
  const name = options.name || titleCase(id);
  const version = options.version || '0.1.0';
  const main = options.main || 'index.js';
  const author = options.author || 'Your Name';

  const manifest = {
    id,
    name,
    version,
    description: 'Describe your extension here.',
    author: {
      name: author
    },
    engines: {
      bytecode: '^0.0.2'
    },
    main,
    activationEvents: ['onStartup']
  };

  writeFileSafe(
    path.join(extensionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    force
  );

  const indexContents = `// ${name} - ByteCode Extension\n\n// The ByteCode API is available as the global \"bytecode\" object.\nbytecode.hooks.on('editor:ready', () => {\n  bytecode.ui.showNotification('✅ ${name} loaded!', 'success');\n});\n`;
  writeFileSafe(path.join(extensionDir, main), indexContents, force);

  const readmeContents = `# ${name}\n\nDescribe what your extension does.\n\n## Development\n\n- Entry point: \`${main}\`\n- Manifest: \`manifest.json\`\n\n## Build\n\n\
\
	npx bcext build .\n\nYou can then install the generated .bcext inside ByteCode.\n`;
  writeFileSafe(path.join(extensionDir, 'README.md'), readmeContents, force);

  console.log(`✅ Extension scaffold created in ${extensionDir}`);
}

function commandValidate(args) {
  const { positionals } = parseArgs(args);
  const target = positionals[0] || '.';
  const extensionDir = path.resolve(target);

  const { errors } = validateExtension(extensionDir);
  if (errors.length > 0) {
    console.error('❌ Validation failed:');
    errors.forEach(err => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log('✅ Extension is valid.');
}

function addDirectoryToZip(dir, zip, zipPath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }

    if (entry.name.endsWith('.bcext')) {
      continue;
    }

    const entryZipPath = path.join(zipPath, entry.name);

    if (entry.isDirectory()) {
      addDirectoryToZip(entryPath, zip, entryZipPath);
    } else {
      zip.addLocalFile(entryPath, zipPath);
    }
  }
}

function commandBuild(args) {
  const { options, positionals } = parseArgs(args);
  const target = positionals[0] || '.';
  const extensionDir = path.resolve(target);

  const { manifest, errors } = validateExtension(extensionDir);
  if (errors.length > 0) {
    console.error('❌ Cannot build extension due to validation errors:');
    errors.forEach(err => console.error(`- ${err}`));
    process.exit(1);
  }

  const outputDir = options.out ? path.resolve(options.out) : path.join(extensionDir, 'dist');
  ensureDir(outputDir);

  const outputFilename = `${manifest.id}-${manifest.version}.bcext`;
  const outputPath = path.join(outputDir, outputFilename);

  const zip = new AdmZip();
  addDirectoryToZip(extensionDir, zip, '');
  zip.writeZip(outputPath);

  console.log(`✅ Build complete: ${outputPath}`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'init':
      commandInit(args);
      return;
    case 'validate':
      commandValidate(args);
      return;
    case 'build':
      commandBuild(args);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
