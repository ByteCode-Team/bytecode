// Variables globales
let fileCounter = 1;
let editor;
let openFiles = [];
let currentFileIndex = -1;
window.currentFolder = null;
let folderStructure = [];
let ipcRenderer;
let pathModule;
let isOpeningFile = false;
window.terminalManager = null;
let settings = {
    autosave: false,
    language: 'en',
    theme: 'vs-dark'
};
let autoSaveInterval = null;
let translations = {};
let currentLang = 'en';

// Initialisation immédiate des modules Electron (avant Monaco)
const electron = require('electron');
const fs = require('fs');
ipcRenderer = electron.ipcRenderer;
pathModule = require('path');

// Load translations
function loadTranslations() {
    try {
        const translationsPath = pathModule.join(__dirname, 'translations.json');
        const data = fs.readFileSync(translationsPath, 'utf8');
        translations = JSON.parse(data);
    } catch (err) {
        console.error('Failed to load translations:', err);
        translations = { en: {} };
    }
}

function t(key) {
    return translations[currentLang]?.[key] || translations['en']?.[key] || key;
}

loadTranslations();

// Load settings from IPC
ipcRenderer.send('load-settings');

ipcRenderer.on('settings-loaded', (event, loadedSettings) => {
    if (loadedSettings) {
        settings = { ...settings, ...loadedSettings };
        currentLang = settings.language || 'en';

        // Apply auto-save if enabled
        if (settings.autosave) {
            startAutoSave();
        }
    }
});

// Configuration de Monaco Editor avec le chemin local
const amdRequire = require('monaco-editor/min/vs/loader.js').require;
const amdDefine = require('monaco-editor/min/vs/loader.js').require.define;

amdRequire.config({
    baseUrl: require('path').join(__dirname, 'node_modules', 'monaco-editor', 'min').replace(/\\/g, '/')
});

// Auto-configuration pour les workers
self.MonacoEnvironment = {
    getWorkerUrl: function (workerId, label) {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: '${require('path').join(__dirname, 'node_modules', 'monaco-editor', 'min').replace(/\\/g, '/')}'
            };
            importScripts('${require('path').join(__dirname, 'node_modules', 'monaco-editor', 'min', 'vs', 'base', 'worker', 'workerMain.js').replace(/\\/g, '/')}');
        `)}`;
    }
};

amdRequire(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: '',
        theme: settings.theme || 'vs-dark',
        language: 'javascript',
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: 'selection',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: true,
        smoothScrolling: true,
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        glyphMargin: true,
        folding: true,
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 3,
        renderLineHighlight: 'all',
        scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: true,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
        }
    });

    document.getElementById('editor').style.display = 'none';

    editor.onDidChangeCursorPosition((e) => {
        updateStatusBar();
    });

    editor.onDidChangeModelContent(() => {
        if (currentFileIndex >= 0 && !isOpeningFile) {
            openFiles[currentFileIndex].modified = true;
            openFiles[currentFileIndex].content = editor.getValue();
            updateEditorTabs();
        }
    });

    monaco.editor.defineTheme('custom-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'C586C0' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'number', foreground: 'B5CEA8' }
        ],
        colors: {
            'editor.background': '#1e1e1e',
            'editor.foreground': '#d4d4d4',
            'editorLineNumber.foreground': '#858585',
            'editorLineNumber.activeForeground': '#c6c6c6',
            'editor.selectionBackground': '#264f78',
            'editor.inactiveSelectionBackground': '#3a3d41'
        }
    });

    monaco.editor.setTheme(settings.theme || 'custom-dark');
});

function getLanguageFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'md': 'markdown',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'sql': 'sql',
        'sh': 'shell',
        'txt': 'plaintext'
    };
    return langMap[ext] || 'plaintext';
}

// SVG Icons for files
const fileIcons = {
    folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H7.71l-1.42-1.71A1.5 1.5 0 004.86 2H1.5z"/></svg>`,
    folderOpen: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M.5 3A1.5 1.5 0 012 1.5h3.86a1.5 1.5 0 011.14.53L8.42 4H14a1.5 1.5 0 011.5 1.5v.5H2.5A1.5 1.5 0 001 7.5v5.09A1.5 1.5 0 01.5 11V3z"/><path d="M2.5 7h12.38a1 1 0 01.98 1.21l-1.27 6A1 1 0 0113.6 15H2.5A1.5 1.5 0 011 13.5V8.5A1.5 1.5 0 012.5 7z"/></svg>`,
    js: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f7df1e"><rect width="16" height="16" rx="2"/><text x="3" y="12" font-size="8" font-weight="bold" fill="#000">JS</text></svg>`,
    ts: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#3178c6"><rect width="16" height="16" rx="2"/><text x="3" y="12" font-size="8" font-weight="bold" fill="#fff">TS</text></svg>`,
    html: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#e34c26"><path d="M1 0l1.27 14.29L8 16l5.73-1.71L15 0H1zm11.18 4.5H5.4l.18 2h6.42l-.54 6.07-3.46.93-3.46-.93-.24-2.57h1.96l.12 1.32 1.62.43 1.62-.43.18-1.82H4.94l-.48-5.5h7.2l-.48.5z"/></svg>`,
    css: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#264de4"><path d="M1 0l1.27 14.29L8 16l5.73-1.71L15 0H1zm10.67 4.5H5.17l.17 2h6.16l-.5 5.57L8 13l-3-1-.2-2.5h2l.1 1.25L8 11l1.1-.25.12-1.25H4.83l-.5-5.5h7.34v.5z"/></svg>`,
    json: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#cbcb41"><path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm3 1v2h2V3H5zm4 0v2h2V3H9zM5 7v2h2V7H5zm4 0v2h2V7H9zm-4 4v2h2v-2H5z"/></svg>`,
    md: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#519aba"><path d="M2 2h12a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4a2 2 0 012-2zm1 3v6h1.5V7.5L6 9.5l1.5-2V11H9V5H7.5l-1.5 2-1.5-2H3zm8 0v4l1.5-2 1.5 2V5h-1v2.5L12 6l-1 1.5V5h-1z"/></svg>`,
    py: `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#3776ab" d="M8 0C4 0 4.5 1.75 4.5 1.75v1.8h3.6v.55H2.5S0 3.8 0 8s2.2 4.1 2.2 4.1h1.3V10s-.1-2.2 2.2-2.2h3.8s2.1 0 2.1-2V2.1S11.9 0 8 0zM5.8 1.2a.7.7 0 110 1.4.7.7 0 010-1.4z"/><path fill="#ffd43b" d="M8 16c4 0 3.5-1.75 3.5-1.75v-1.8H7.9v-.55h5.6s2.5.3 2.5-4.1-2.2-4.1-2.2-4.1h-1.3V6s.1 2.2-2.2 2.2H6.5s-2.1 0-2.1 2v3.7S4.1 16 8 16zm2.2-1.2a.7.7 0 110-1.4.7.7 0 010 1.4z"/></svg>`,
    java: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#e76f00"><path d="M5.7 9.5s-.6.4.4.5c1.2.1 1.8.1 3.1-.1 0 0 .3.2.8.4-2.9 1.2-6.5-.1-4.3-.8zm-.4-1.8s-.6.5.4.6c1.3.1 2.3.1 4-.2 0 0 .2.2.6.4-3.5 1-7.4.1-5-.8z"/><path d="M9 6.2c.7.8-.2 1.5-.2 1.5s1.8-.9 1-2c-.8-1-1.4-1.5 1.8-3.3 0 0-5 1.2-2.6 3.8z"/><path d="M13.3 10.5s.4.4-.5.7c-1.7.5-7 .7-8.5 0-.5-.2.5-.5.8-.6.3-.1.5 0 .5 0-.6-.4-3.7.8-1.6 1.2 5.8 1 10.5-.5 9.3-1.3zm-7.4-5.4s-2.6.6-1 .9c.7.1 2.1.1 3.4 0 1.1-.1 2.1-.3 2.1-.3s-.4.1-.6.3c-2.6.7-7.6.4-6.2-.3 1.2-.6 2.3-.6 2.3-.6zm4.6 2.6c2.7-1.4 1.4-2.7.6-2.5-.2 0-.3.1-.3.1s.1-.1.3-.2c2-1 3.5 1.8-.5 2.8 0 0 0-.1-.1-.2z"/><path d="M10.3 0s1.5 1.5-1.4 3.8c-2.3 1.8-.5 2.9 0 4.1-1.4-1.2-2.4-2.3-1.7-3.3 1-1.5 3.8-2.2 3.1-4.6z"/><path d="M6 14.4c2.6.2 6.5-.1 6.6-.9 0 0-.2.5-2.2.8-2.3.4-5.2.4-6.9.1 0 0 .3.3 2.5.4z"/></svg>`,
    cpp: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#00599c"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm2.5 9h-1v1h-1V9h-1V8h1V7h1v1h1v1zm3 0h-1v1h-1V9h-1V8h1V7h1v1h1v1zM5 10.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`,
    c: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#a8b9cc"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM5 10.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`,
    go: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#00add8"><path d="M1 7.5l.5-.5h2l.5.5v1l-.5.5h-2l-.5-.5v-1zm11 0l.5-.5h2l.5.5v1l-.5.5h-2l-.5-.5v-1zM8 3a5 5 0 100 10A5 5 0 008 3zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>`,
    rs: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#dea584"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 2a6 6 0 110 12A6 6 0 018 2zm0 1.5a.75.75 0 100 1.5.75.75 0 000-1.5zM5.5 5a.75.75 0 100 1.5.75.75 0 000-1.5zm5 0a.75.75 0 100 1.5.75.75 0 000-1.5zM4 8v1.5c0 2.2 1.8 4 4 4s4-1.8 4-4V8H4z"/></svg>`,
    php: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#777bb4"><ellipse cx="8" cy="8" rx="8" ry="5"/><text x="3" y="10" font-size="6" font-weight="bold" fill="#fff">php</text></svg>`,
    rb: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#cc342d"><path d="M8 0L1 4v8l7 4 7-4V4L8 0zm0 2l5 3v6l-5 3-5-3V5l5-3z"/></svg>`,
    xml: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f80"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm2 3l2 3-2 3H3l2-3-2-3h1zm6 0l2 3-2 3h-1l2-3-2-3h1z"/></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#26a69a"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm2 2a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-2 8l3-4 2 2 4-5 5 7H2z"/></svg>`,
    video: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f44336"><path d="M2 3a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V9l4 2V5l-4 2V5a2 2 0 00-2-2H2z"/></svg>`,
    audio: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#9c27b0"><path d="M6 2v12l-4-4H0V6h2l4-4zm4.5 2a5 5 0 010 8l-1-1.5a3 3 0 000-5l1-1.5zm2 -2a8 8 0 010 12l-1-1.5a6 6 0 000-9l1-1.5z"/></svg>`,
    pdf: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f44336"><path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4l-4-4H2zm8 0v4h4L10 0zM3 9h1c.6 0 1 .4 1 1s-.4 1-1 1H3.5v1H3V9zm3 0h1.2c.5 0 .8.4.8.9v1.2c0 .5-.3.9-.8.9H6V9zm3 0h2v.5h-1.5v.7h1v.5h-1v1.3H12V9z"/></svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#90a4ae"><path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4l-4-4H2zm8 0v4h4L10 0z"/></svg>`,
    git: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f05032"><path d="M15.7 7.3l-7-7a1 1 0 00-1.4 0l-1.5 1.5 1.9 1.9a1.2 1.2 0 011.5 1.5l1.8 1.8a1.2 1.2 0 11-.7.7L8.5 6a1.2 1.2 0 01-1.3 0v3.8a1.2 1.2 0 11-1-.1V5.8a1.2 1.2 0 01-.6-1.6L3.7 2.3l-7 7a1 1 0 000 1.4l7 7a1 1 0 001.4 0l7-7a1 1 0 000-1.4z"/></svg>`,
    config: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#6d8086"><path d="M8 0l1.5 2.5H12l.5 2.5L15 6l-1 2.5 1 2.5-2.5 1-.5 2.5h-2.5L8 16l-1.5-2.5H4l-.5-2.5L1 10l1-2.5L1 5l2.5-1L4 1.5h2.5L8 0zm0 5a3 3 0 100 6 3 3 0 000-6z"/></svg>`,
    lock: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#ffc107"><path d="M8 0a4 4 0 00-4 4v2H3a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-1-1h-1V4a4 4 0 00-4-4zm0 2a2 2 0 012 2v2H6V4a2 2 0 012-2z"/></svg>`,
    env: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#4caf50"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm1 3h2v1H3V5zm0 2h4v1H3V7zm0 2h3v1H3V9z"/></svg>`,
    shell: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#4caf50"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm1 3l3 2.5L3 10V5zm4 4h5v1H7V9z"/></svg>`,
    react: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#61dafb"><circle cx="8" cy="8" r="1.5"/><ellipse cx="8" cy="8" rx="7" ry="2.5" fill="none" stroke="#61dafb" stroke-width=".8"/><ellipse cx="8" cy="8" rx="7" ry="2.5" fill="none" stroke="#61dafb" stroke-width=".8" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="7" ry="2.5" fill="none" stroke="#61dafb" stroke-width=".8" transform="rotate(120 8 8)"/></svg>`,
    vue: `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#41b883" d="M1 1h3l4 7 4-7h3L8 15 1 1z"/><path fill="#35495e" d="M4 1h2l2 3.5L10 1h2L8 9 4 1z"/></svg>`,
    scss: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#c6538c"><rect width="16" height="16" rx="2"/><text x="2" y="11" font-size="6" font-weight="bold" fill="#fff">Scss</text></svg>`,
    yaml: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#cb171e"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm1 3h1l1.5 2.5L7 5h1v5H7V7.5L5.5 10 4 7.5V10H3V5zm6 0h4v1h-3v1h2v1h-2v1h3v1H9V5z"/></svg>`,
    sql: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#f29111"><path d="M8 0C4 0 1 1.3 1 3v10c0 1.7 3 3 7 3s7-1.3 7-3V3c0-1.7-3-3-7-3zm0 2c3.3 0 5 .9 5 1s-1.7 1-5 1-5-.9-5-1 1.7-1 5-1z"/></svg>`
};

function getIconForFile(filename, isFolder) {
    if (isFolder) return fileIcons.folder;

    const ext = filename.split('.').pop().toLowerCase();
    const name = filename.toLowerCase();

    // Special files
    if (name === '.gitignore' || name === '.gitattributes') return fileIcons.git;
    if (name === 'package.json' || name === 'package-lock.json') return fileIcons.json;
    if (name === '.env' || name.startsWith('.env.')) return fileIcons.env;
    if (name === 'dockerfile' || name === 'docker-compose.yml') return fileIcons.config;
    if (name.endsWith('.config.js') || name.endsWith('.config.ts')) return fileIcons.config;
    if (name.endsWith('.lock')) return fileIcons.lock;

    const iconMap = {
        'js': fileIcons.js,
        'mjs': fileIcons.js,
        'cjs': fileIcons.js,
        'jsx': fileIcons.react,
        'ts': fileIcons.ts,
        'tsx': fileIcons.react,
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
        'cs': fileIcons.cpp,
        'php': fileIcons.php,
        'rb': fileIcons.rb,
        'go': fileIcons.go,
        'rs': fileIcons.rs,
        'xml': fileIcons.xml,
        'svg': fileIcons.xml,
        'png': fileIcons.image,
        'jpg': fileIcons.image,
        'jpeg': fileIcons.image,
        'gif': fileIcons.image,
        'bmp': fileIcons.image,
        'webp': fileIcons.image,
        'ico': fileIcons.image,
        'mp4': fileIcons.video,
        'webm': fileIcons.video,
        'avi': fileIcons.video,
        'mov': fileIcons.video,
        'mp3': fileIcons.audio,
        'wav': fileIcons.audio,
        'ogg': fileIcons.audio,
        'pdf': fileIcons.pdf,
        'txt': fileIcons.default,
        'log': fileIcons.default,
        'sh': fileIcons.shell,
        'bash': fileIcons.shell,
        'zsh': fileIcons.shell,
        'bat': fileIcons.shell,
        'cmd': fileIcons.shell,
        'ps1': fileIcons.shell,
        'vue': fileIcons.vue,
        'yaml': fileIcons.yaml,
        'yml': fileIcons.yaml,
        'sql': fileIcons.sql,
        'gitignore': fileIcons.git
    };
    return iconMap[ext] || fileIcons.default;
}

function createNewFile() {
    const newFile = {
        name: `Untitled-${fileCounter++}`,
        content: '',
        path: null,
        modified: false,
        language: 'plaintext'
    };

    openFiles.push(newFile);
    currentFileIndex = openFiles.length - 1;

    switchToFile(currentFileIndex);
    updateEditorTabs();
}

function openFile() {
    ipcRenderer.send('open-file-dialog');
}

function openFolder() {
    ipcRenderer.send('open-folder-dialog');
}

function switchToFile(index) {
    if (index < 0 || index >= openFiles.length) return;

    currentFileIndex = index;
    const file = openFiles[index];
    const ext = file.name.split('.').pop().toLowerCase();

    const welcomeScreen = document.getElementById('welcome-screen');
    const editorContainer = document.getElementById('editor');
    const previewContainer = document.getElementById('preview-container');
    const previewContent = document.getElementById('preview-content');
    const previewMsg = document.getElementById('preview-msg');

    // Hide all
    welcomeScreen.style.display = 'none';
    editorContainer.style.display = 'none';
    previewContainer.style.display = 'none';

    // Check for previewable files
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) {
        previewContainer.style.display = 'flex';
        previewContent.innerHTML = `<img src="${file.path}" style="max-width:100%; max-height:100%; object-fit: contain;">`;
        previewMsg.textContent = `${file.name} (${ext.toUpperCase()})`;
    } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
        previewContainer.style.display = 'flex';
        previewContent.innerHTML = `<video src="${file.path}" controls style="max-width:100%; max-height:100%"></video>`;
        previewMsg.textContent = `${file.name} (${ext.toUpperCase()})`;
    } else if (ext === 'pdf') {
        previewContainer.style.display = 'flex';
        previewContent.innerHTML = `<iframe src="${file.path}" style="width:100%; height:100%; border:none;"></iframe>`;
        previewMsg.textContent = `${file.name} (${ext.toUpperCase()})`;
    } else {
        // Text file - show editor
        editorContainer.style.display = 'block';
        if (editor) {
            isOpeningFile = true;
            editor.setValue(file.content);
            isOpeningFile = false;

            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, file.language);
            }
            editor.focus();
        }
    }

    updateTitleBar();
    updateStatusBar();
    updateEditorTabs();
    updateTreeSelection();
}

function closeFile(index) {
    if (openFiles[index].modified) {
        const response = confirm(`${openFiles[index].name} ${t('unsavedChanges')}`);
        if (!response) return;
    }

    openFiles.splice(index, 1);

    if (openFiles.length === 0) {
        currentFileIndex = -1;
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('editor').style.display = 'none';
        document.getElementById('preview-container').style.display = 'none';
        updateTitleBar();
    } else {
        if (currentFileIndex >= index) {
            currentFileIndex = Math.max(0, currentFileIndex - 1);
        }
        switchToFile(currentFileIndex);
    }

    updateEditorTabs();
}

function updateEditorTabs() {
    const container = document.getElementById('editor-tabs');
    container.innerHTML = '';

    openFiles.forEach((file, index) => {
        const tab = document.createElement('button');
        tab.className = 'editor-tab' + (index === currentFileIndex ? ' active' : '');
        tab.onclick = () => switchToFile(index);

        tab.innerHTML = `
            <span class="editor-tab-name">${file.name}${file.modified ? ' •' : ''}</span>
            <span class="editor-tab-close" onclick="event.stopPropagation(); closeFile(${index})">×</span>
        `;

        container.appendChild(tab);
    });
}

function updateTitleBar() {
    const fileInfo = document.getElementById('titlebar-file');
    if (currentFileIndex >= 0) {
        const file = openFiles[currentFileIndex];
        fileInfo.textContent = file.path || file.name;
    } else {
        fileInfo.textContent = '';
    }
}

function updateStatusBar() {
    if (currentFileIndex >= 0 && editor) {
        const position = editor.getPosition();
        document.getElementById('statusbar-line').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
        document.getElementById('statusbar-lang').textContent = openFiles[currentFileIndex].language.toUpperCase();
    }
}

function renderFolderTree(structure, container, level = 0) {
    structure.forEach(item => {
        const itemDiv = document.createElement('div');

        if (item.type === 'folder') {
            const folderHeader = document.createElement('div');
            folderHeader.className = 'tree-item folder';
            folderHeader.style.paddingLeft = `${12 + level * 16}px`;
            folderHeader.innerHTML = `
                <span class="tree-arrow">▶</span>
                <span class="tree-icon">${getIconForFile(item.name, true)}</span>
                <span>${item.name}</span>
            `;

            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children';

            folderHeader.onclick = (e) => {
                e.stopPropagation();
                const arrow = folderHeader.querySelector('.tree-arrow');
                const isExpanded = childrenDiv.classList.contains('expanded');

                if (isExpanded) {
                    childrenDiv.classList.remove('expanded');
                    arrow.classList.remove('expanded');
                } else {
                    if (item.children.length === 0) {
                        ipcRenderer.send('load-folder-contents', item.path);
                        item.element = childrenDiv;
                    }
                    childrenDiv.classList.add('expanded');
                    arrow.classList.add('expanded');
                }
            };

            // Context menu for folders
            folderHeader.oncontextmenu = (e) => {
                if (window.showContextMenu) {
                    window.showContextMenu(e, item.path, 'folder');
                }
            };

            itemDiv.appendChild(folderHeader);
            itemDiv.appendChild(childrenDiv);

            if (item.children && item.children.length > 0) {
                renderFolderTree(item.children, childrenDiv, level + 1);
            }
        } else {
            const fileItem = document.createElement('div');
            fileItem.className = 'tree-item';
            fileItem.style.paddingLeft = `${28 + level * 16}px`;
            fileItem.dataset.path = item.path;
            fileItem.innerHTML = `
                <span class="tree-icon">${getIconForFile(item.name, false)}</span>
                <span>${item.name}</span>
            `;

            fileItem.onclick = () => {
                const existingIndex = openFiles.findIndex(f => f.path === item.path);

                if (existingIndex >= 0) {
                    switchToFile(existingIndex);
                } else {
                    ipcRenderer.send('read-file', item.path);
                }
            };

            // Context menu for files
            fileItem.oncontextmenu = (e) => {
                if (window.showContextMenu) {
                    window.showContextMenu(e, item.path, 'file');
                }
            };

            itemDiv.appendChild(fileItem);
        }

        container.appendChild(itemDiv);
    });
}

function updateTreeSelection() {
    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
    });

    if (currentFileIndex >= 0 && openFiles[currentFileIndex].path) {
        const currentPath = openFiles[currentFileIndex].path;
        const treeItem = document.querySelector(`.tree-item[data-path="${currentPath}"]`);
        if (treeItem) {
            treeItem.classList.add('selected');
        }
    }
}

function saveCurrentFile() {
    if (currentFileIndex >= 0) {
        const file = openFiles[currentFileIndex];
        ipcRenderer.send('save-file-content', {
            filePath: file.path,
            content: file.content
        });
    }
}

// IPC Event Listeners
ipcRenderer.on('new-file', () => {
    createNewFile();
});

ipcRenderer.on('save-file', () => {
    saveCurrentFile();
});

ipcRenderer.on('save-file-as', () => {
    if (currentFileIndex >= 0) {
        const file = openFiles[currentFileIndex];
        ipcRenderer.send('save-file-content', {
            filePath: null,
            content: file.content
        });
    }
});

ipcRenderer.on('file-opened', (event, data) => {
    const existingIndex = openFiles.findIndex(f => f.path === data.path);

    if (existingIndex >= 0) {
        switchToFile(existingIndex);
    } else {
        const language = getLanguageFromExtension(data.name);
        const newFile = {
            name: data.name,
            content: data.content,
            path: data.path,
            modified: false,
            language: language
        };

        openFiles.push(newFile);
        currentFileIndex = openFiles.length - 1;
        switchToFile(currentFileIndex);
    }
});

ipcRenderer.on('folder-opened', (event, data) => {
    // Fermer tous les fichiers ouverts de l'ancien dossier
    closeAllFiles();

    // Réinitialiser le terminal
    resetTerminals();

    window.currentFolder = data;
    folderStructure = data.structure;

    const container = document.getElementById('folder-tree');
    container.innerHTML = `<div class="folder-name">${data.name}</div>`;

    renderFolderTree(data.structure, container, 0);
});

// Fonction pour fermer tous les fichiers
function closeAllFiles() {
    // Vérifier s'il y a des fichiers modifiés
    const hasModified = openFiles.some(f => f.modified);
    if (hasModified) {
        if (!confirm('Des fichiers non sauvegardés seront perdus. Continuer?')) {
            return false;
        }
    }

    openFiles = [];
    currentFileIndex = -1;
    fileCounter = 1;

    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('editor').style.display = 'none';
    document.getElementById('preview-container').style.display = 'none';
    updateEditorTabs();
    updateTitleBar();

    return true;
}

ipcRenderer.on('folder-contents-loaded', (event, data) => {
    const item = findItemByPath(folderStructure, data.path);
    if (item && item.element) {
        item.children = data.structure;
        renderFolderTree(data.structure, item.element, getItemLevel(data.path));
    }
});

ipcRenderer.on('file-read-success', (event, data) => {
    const existingIndex = openFiles.findIndex(f => f.path === data.path);

    if (existingIndex >= 0) {
        switchToFile(existingIndex);
    } else {
        const language = getLanguageFromExtension(data.name);
        const newFile = {
            name: data.name,
            content: data.content,
            path: data.path,
            modified: false,
            language: language
        };

        openFiles.push(newFile);
        currentFileIndex = openFiles.length - 1;
        switchToFile(currentFileIndex);
    }
});

ipcRenderer.on('save-file-result', (event, result) => {
    if (result.success && currentFileIndex >= 0) {
        const file = openFiles[currentFileIndex];
        file.modified = false;
        if (result.path) {
            file.path = result.path;
            file.name = pathModule.basename(result.path);
            file.language = getLanguageFromExtension(file.name);
        }
        updateEditorTabs();
        updateTitleBar();
    }
});

ipcRenderer.on('find', () => {
    if (editor) {
        editor.trigger('', 'actions.find');
    }
});

ipcRenderer.on('replace', () => {
    if (editor) {
        editor.trigger('', 'actions.startFindReplaceAction');
    }
});

ipcRenderer.on('close-folder', () => {
    window.currentFolder = null;
    folderStructure = [];
    const container = document.getElementById('folder-tree');
    container.innerHTML = `
        <div class="no-folder">
            <p>${t('noFolderOpened')}</p>
            <button class="no-folder-btn" onclick="openFolder()">${t('openFolder')}</button>
        </div>
    `;
});

// Helper functions
function findItemByPath(items, targetPath) {
    for (const item of items) {
        if (item.path === targetPath) return item;
        if (item.children) {
            const found = findItemByPath(item.children, targetPath);
            if (found) return found;
        }
    }
    return null;
}

function getItemLevel(itemPath) {
    if (!window.currentFolder) return 0;
    const relative = itemPath.replace(window.currentFolder.path, '');
    return (relative.match(/[\/\\]/g) || []).length;
}

// New Features Functions

function toggleTerminal() {
    const container = document.getElementById('terminal-container');
    if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'flex';
        if (!window.terminalManager) {
            window.terminalManager = new TerminalManager(container);
        }
        window.terminalManager.focus();
    } else {
        container.style.display = 'none';
    }
    if (editor) editor.layout();
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    document.getElementById('setting-autosave').checked = settings.autosave;
    document.getElementById('setting-language').value = settings.language;
    document.getElementById('setting-theme').value = settings.theme;
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function toggleAutoSave() {
    settings.autosave = document.getElementById('setting-autosave').checked;
    saveSettings();
    if (settings.autosave) {
        startAutoSave();
    } else {
        stopAutoSave();
    }
}

function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        if (currentFileIndex >= 0 && openFiles[currentFileIndex].modified) {
            saveCurrentFile();
        }
    }, 30000); // Auto save every 30 seconds
}

function stopAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = null;
}

function changeLanguage() {
    settings.language = document.getElementById('setting-language').value;
    saveSettings();
    if (confirm(t('restartRequired'))) {
        ipcRenderer.send('restart-app');
    }
}

function changeTheme() {
    settings.theme = document.getElementById('setting-theme').value;
    saveSettings();
    monaco.editor.setTheme(settings.theme);
}

function saveSettings() {
    ipcRenderer.send('save-settings', settings);
}

function closeApp() {
    if (openFiles.some(f => f.modified)) {
        if (confirm(t('exitWithUnsaved'))) {
            ipcRenderer.send('close-app');
            window.close();
        }
    } else {
        window.close();
    }
}

function triggerEdit(action) {
    if (editor) {
        const actionMap = {
            'undo': 'undo',
            'redo': 'redo',
            'cut': 'editor.action.clipboardCutAction',
            'copy': 'editor.action.clipboardCopyAction',
            'paste': 'editor.action.clipboardPasteAction'
        };
        editor.trigger('source', actionMap[action] || action);
    }
}

function toggleFullScreen() {
    ipcRenderer.send('toggle-fullscreen');
}

function showAbout() {
    ipcRenderer.send('show-about');
}

// Expose all functions to window for onclick handlers
window.createNewFile = createNewFile;
window.openFile = openFile;
window.openFolder = openFolder;
window.closeFile = closeFile;
window.toggleTerminal = toggleTerminal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleAutoSave = toggleAutoSave;
window.changeLanguage = changeLanguage;
window.changeTheme = changeTheme;
window.closeApp = closeApp;
window.triggerEdit = triggerEdit;
window.toggleFullScreen = toggleFullScreen;
window.showAbout = showAbout;
window.saveCurrentFile = saveCurrentFile;
window.saveFileAs = () => ipcRenderer.send('save-file-as');
window.closeAllFiles = closeAllFiles;
window.openFiles = openFiles;
window.updateEditorTabs = updateEditorTabs;
window.updateTitleBar = updateTitleBar;
window.renderFolderTree = renderFolderTree;

// Debug: log when script is fully loaded
console.log('ByteCode renderer.js loaded successfully');
console.log('Available functions:', Object.keys(window).filter(k => typeof window[k] === 'function' && ['createNewFile', 'openFile', 'openFolder'].includes(k)));