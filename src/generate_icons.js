
const fs = require('fs');
const path = require('path');

const iconsDir = path.join('assets', 'icons');
const files = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg'));

const fileIcons = {};
const iconMap = {};

const nameMapping = {
    'javascript': 'js',
    'typescript': 'ts',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'python': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'csharp': 'cs',
    'php': 'php',
    'ruby': 'rb',
    'go': 'go',
    'rust': 'rs',
    'markdown': 'md',
    'vue': 'vue',
    'scss': 'scss',
    'yaml': 'yaml',
    'sql': 'sql',
    'shell': 'sh',
    'react': 'jsx', // Assuming react for jsx
    'folder-base': 'folder',
    'folder-base-open': 'folderOpen',
    'git': 'git',
    'npm': 'npm',
    'nodejs': 'nodejs',
    'pdf': 'pdf',
    'zip': 'zip',
    'exe': 'exe',
    'visualstudio': 'visualstudio',
    'vscode': 'vscode',
    'vite': 'vite',
    'tsconfig': 'tsconfig',
    'readme': 'readme',
    'contributing': 'contributing',
    'license': 'license',
    'docker': 'docker',
    'database': 'database',
    'console': 'console',
    'powershell': 'powershell',
    'angular': 'angular',
    'android': 'android',
    'next': 'next',
    'figma': 'figma',
    'godot': 'godot',
    'gradle': 'gradle',
    'i18n': 'i18n',
    'luau': 'luau',
    'roblox': 'roblox',
    'minecraft': 'minecraft',
    'netlify': 'netlify',
    'pascal': 'pascal',
    'perl': 'perl',
    'replit': 'replit',
    'todo': 'todo',
    'virtual': 'virtual',
    'xaml': 'xaml',
};

files.forEach(file => {
    const name = file.replace('material-icon-theme--', '').replace('.svg', '');
    const content = fs.readFileSync(path.join(iconsDir, file), 'utf-8');
    const key = nameMapping[name] || name.replace(/-/g, '');
    fileIcons[key] = `\`${content.replace(/`/g, '\\`')}\``; // Store as template literal
    if (nameMapping[name]) {
        iconMap[nameMapping[name]] = `fileIcons.${key}`;
    }
});

// Add a default icon
fileIcons['default'] = '`<svg width="16" height="16" viewBox="0 0 16 16" fill="#90a4ae"><path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4l-4-4H2zm8 0v4h4L10 0z"/></svg>`';


let fileIconsString = 'const fileIcons = {\n';
for (const key in fileIcons) {
    fileIconsString += `    ${key}: ${fileIcons[key]},
`;
}
fileIconsString += '};';


const getIconForFileFunction = `
function getIconForFile(filename, isFolder) {
    if (isFolder) {
        // Simplified logic for open/closed state
        return fileIcons.folder;
    }

    const ext = filename.split('.').pop().toLowerCase();
    const name = filename.toLowerCase();

    // Special file names
    if (name === '.gitignore' || name === '.gitattributes') return fileIcons.git;
    if (name === 'package.json') return fileIcons.npm;
    if (name === 'package-lock.json') return fileIcons.npm;
    if (name.startsWith('.env')) return fileIcons.console;
    if (name === 'dockerfile' || name === 'docker-compose.yml') return fileIcons.docker;
    if (name.endsWith('.config.js') || name.endsWith('.config.ts')) return fileIcons.console;
    if (name.endsWith('.lock')) return fileIcons.lock;
    if (name === 'readme.md') return fileIcons.readme;
    if (name.includes('license')) return fileIcons.license;
    if (name === 'tsconfig.json') return fileIcons.tsconfig;
    if (name === 'vite.config.js' || name === 'vite.config.ts') return fileIcons.vite;


    const extMap = {
        'js': fileIcons.js,
        'mjs': fileIcons.js,
        'cjs': fileIcons.js,
        'jsx': fileIcons.jsx,
        'ts': fileIcons.ts,
        'tsx': fileIcons.jsx,
        'html': fileIcons.html,
        'htm': fileIcons.html,
        'css': fileIcons.css,
        'scss': fileIcons.scss,
        'sass': fileIcons.scss,
        'less': fileIcons.css,
        'json': fileIcons.json,
        'md': fileIcons.md,
        'markdown': fileIcons.md,
        'py': fileIcons.py,
        'pyw': fileIcons.py,
        'java': fileIcons.java,
        'jar': fileIcons.java,
        'cpp': fileIcons.cpp,
        'cc': fileIcons.cpp,
        'cxx': fileIcons.cpp,
        'c': fileIcons.c,
        'h': fileIcons.c,
        'hpp': fileIcons.cpp,
        'cs': fileIcons.cs,
        'php': fileIcons.php,
        'rb': fileIcons.rb,
        'go': fileIcons.go,
        'rs': fileIcons.rs,
        'xml': fileIcons.visualstudio,
        'svg': fileIcons.svg,
        'png': fileIcons.images,
        'jpg': fileIcons.images,
        'jpeg': fileIcons.images,
        'gif': fileIcons.images,
        'bmp': fileIcons.images,
        'webp': fileIcons.images,
        'ico': fileIcons.images,
        'mp4': fileIcons.video,
        'webm': fileIcons.video,
        'avi': fileIcons.video,
        'mov': fileIcons.video,
        'mp3': fileIcons.audio,
        'wav': fileIcons.audio,
        'ogg': fileIcons.audio,
        'pdf': fileIcons.pdf,
        'txt': fileIcons.default,
        'log': fileIcons.log,
        'sh': fileIcons.sh,
        'bash': fileIcons.sh,
        'zsh': fileIcons.sh,
        'bat': fileIcons.powershell,
        'cmd': fileIcons.powershell,
        'ps1': fileIcons.powershell,
        'vue': fileIcons.vue,
        'yaml': fileIcons.yaml,
        'yml': fileIcons.yaml,
        'sql': fileIcons.sql,
        'gitignore': fileIcons.git,
        'zip': fileIcons.zip,
        'exe': fileIcons.exe
    };

    return extMap[ext] || fileIcons.default;
}
`;

console.log(fileIconsString);
console.log(getIconForFileFunction);

