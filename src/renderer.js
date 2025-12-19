// Variables globales
let fileCounter = 1;
let editor;
let openFiles = [];
let currentFileIndex = -1;
window.currentFolder = null;
let folderStructure = [];
let expandedFolders = new Set();
let ipcRenderer;
let pathModule;
let isOpeningFile = false;
window.terminalManager = null;
let settings = {
    autosave: false,
    enableAI: true,
    language: 'en',
    theme: 'vs-dark'
};
let autoSaveInterval = null;
let translations = {};
let currentLang = 'en';
window.currentLang = currentLang;
let aiManager = null;
let isAIPanelOpen = false;

// Initialisation immédiate des modules Electron (avant Monaco)
const electron = require('electron');
const fs = require('fs');
ipcRenderer = electron.ipcRenderer;
pathModule = require('path');
const { marked } = require('marked');

// Robust way to find project root in Electron renderer
function getProjectRoot() {
    // Common case: index.html is in root, __dirname is root
    if (fs.existsSync(pathModule.join(__dirname, 'node_modules'))) return __dirname;
    // Case: __dirname is src/
    if (fs.existsSync(pathModule.join(__dirname, '..', 'node_modules'))) return pathModule.join(__dirname, '..');
    // Fallback to CWD
    return process.cwd();
}
window.projectRoot = getProjectRoot();
const nodeModulesPath = pathModule.join(window.projectRoot, 'node_modules').replace(/\\/g, '/');

// Fallback translations in case loading fails
const fallbackTranslations = {
    en: {
        "file": "File",
        "edit": "Edit",
        "view": "View",
        "help": "Help",
        "newFile": "New File",
        "openFile": "Open File",
        "openFolder": "Open Folder",
        "save": "Save",
        "settings": "Settings",
        "explorer": "Explorer",
        "welcomeTitle": "ByteCode",
        "welcomeSubtitle": "Modern and powerful code editor",
        "noFolderOpened": "No folder opened",
        "aiAssistant": "AI Assistant"
    }
};

// Load translations
function loadTranslations() {
    try {
        // Try multiple paths to find translations.json
        const possiblePaths = [
            pathModule.join(window.projectRoot, 'translations.json'),
            pathModule.join(__dirname, '../translations.json'), // From src/
            pathModule.join(process.cwd(), 'translations.json'), // From root
            pathModule.join(__dirname, 'translations.json') // Fallback
        ];

        let loaded = false;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log('Loading translations from:', p);
                const data = fs.readFileSync(p, 'utf8');
                translations = JSON.parse(data);
                loaded = true;
                break;
            }
        }

        if (!loaded) {
            console.error('Could not find translations.json in paths:', possiblePaths);
            translations = fallbackTranslations;
        }
    } catch (err) {
        console.error('Failed to load translations:', err);
        translations = fallbackTranslations;
    }
}

function t(key) {
    if (!translations[currentLang] && !translations['en']) return key;
    return translations[currentLang]?.[key] || translations['en']?.[key] || fallbackTranslations['en'][key] || key;
}

loadTranslations();

// Load settings from IPC
ipcRenderer.send('load-settings');

ipcRenderer.on('settings-loaded', (event, loadedSettings) => {
    if (loadedSettings) {
        settings = { ...settings, ...loadedSettings };
        currentLang = settings.language || 'en';
        window.currentLang = currentLang;
        document.documentElement.lang = currentLang;

        // Apply auto-save if enabled
        if (settings.autosave) {
            startAutoSave();
        }

        updateAIVisibility();
        updateUIText();

        // Open last opened folder if exists
        if (settings.lastOpenedFolder) {
            console.log('Restoring last opened folder:', settings.lastOpenedFolder);
            ipcRenderer.send('load-folder-contents', settings.lastOpenedFolder);
        }
    }
});

// Custom window controls (frameless window)
function initWindowControls() {
    const btnMin = document.getElementById('window-minimize');
    const btnMax = document.getElementById('window-maximize');
    const btnClose = document.getElementById('window-close');
    const titlebar = document.querySelector('.titlebar');

    if (btnMin) btnMin.addEventListener('click', () => ipcRenderer.send('window-minimize'));
    if (btnMax) btnMax.addEventListener('click', () => ipcRenderer.send('window-maximize-toggle'));
    if (btnClose) btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));

    if (titlebar) {
        titlebar.addEventListener('dblclick', () => {
            ipcRenderer.send('window-maximize-toggle');
        });
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initWindowControls);
} else {
    initWindowControls();
}

// Configuration de Monaco Editor avec le chemin local
const amdRequire = require(pathModule.join(window.projectRoot, 'node_modules/monaco-editor/min/vs/loader.js')).require;

amdRequire.config({
    baseUrl: pathModule.join(nodeModulesPath, 'monaco-editor/min').replace(/\\/g, '/')
});

// Auto-configuration pour les workers
self.MonacoEnvironment = {
    getWorkerUrl: function (workerId, label) {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: '${pathModule.join(nodeModulesPath, 'monaco-editor/min').replace(/\\/g, '/')}'
            };
            importScripts('${pathModule.join(nodeModulesPath, 'monaco-editor/min/vs/base/worker/workerMain.js').replace(/\\/g, '/')}');
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

const fileIcons = {};

function loadIcons() {
    let iconsPath;

    // Try to find icons path robustly
    const pathsToTry = [
        pathModule.join(__dirname, '../assets', 'icons'), // Relative to src/
        pathModule.join(__dirname, 'assets', 'icons'),    // Relative to root
        pathModule.join(process.cwd(), 'assets', 'icons') // Relative to CWD
    ];

    let files = [];
    for (const p of pathsToTry) {
        try {
            if (fs.existsSync(p)) {
                iconsPath = p;
                files = fs.readdirSync(p);
                console.log('Icons found at:', p);
                break;
            }
        } catch (e) { }
    }

    if (iconsPath && files.length > 0) {
        files.forEach(file => {
            let iconName = '';
            if (file.startsWith('material-icon-theme--') && file.endsWith('.svg')) {
                iconName = file.replace('material-icon-theme--', '').replace('.svg', '').replace(/-/g, '');
            } else if (file === 'aiicon.svg') {
                iconName = 'ai';
            } else if (file.endsWith('.svg')) {
                iconName = file.replace('.svg', '').replace(/-/g, '').replace('material-icon-theme--', '');
            }

            if (iconName) {
                const filePath = pathModule.join(iconsPath, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    fileIcons[iconName] = content;
                } catch (err) {
                    console.error(`Failed to read icon: ${filePath}`, err);
                }
            }
        });
    } else {
        console.error('Failed to load icons: No icon directory found in ', pathsToTry);
    }

    // Set a default icon
    if (!fileIcons.default) {
        fileIcons.default = `<svg width="16" height="16" viewBox="0 0 16 16" fill="#90a4ae"><path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4l-4-4H2zm8 0v4h4L10 0z"/></svg>`;
    }
    // Fallback for AI icon if not found
    if (!fileIcons.ai) {
        fileIcons.ai = `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-3.87-.78-7-4.61-7-9V8.3l7-3.11v14.82z"/></svg>`;
    }
}

loadIcons();

function getIconForFile(filename, isFolder) {
    if (isFolder) {
        return fileIcons.folderbase || fileIcons.default || `<svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H7.71l-1.42-1.71A1.5 1.5 0 004.86 2H1.5z"/></svg>`;
    }

    const ext = filename.split('.').pop().toLowerCase();
    const name = filename.toLowerCase();

    const nameMap = {
        '.gitignore': 'git',
        '.gitattributes': 'git',
        'package.json': 'npm',
        'package-lock.json': 'npm',
        '.env': 'console',
        'dockerfile': 'docker',
        'docker-compose.yml': 'docker',
        'readme.md': 'readme',
        'license': 'certificate',
        'tsconfig.json': 'tsconfig',
        'vite.config.js': 'vite',
        'vite.config.ts': 'vite',
    };

    if (nameMap[name]) {
        return fileIcons[nameMap[name]] || fileIcons.default;
    }

    if (name.endsWith('.config.js') || name.endsWith('.config.ts')) return fileIcons.console;
    if (name.endsWith('.lock')) return fileIcons.lock;


    const extMap = {
        'js': 'javascript',
        'mjs': 'javascript',
        'cjs': 'javascript',
        'jsx': 'react',
        'ts': 'typescript',
        'tsx': 'react',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'scss',
        'less': 'css',
        'json': 'json',
        'md': 'markdown',
        'py': 'python',
        'pyw': 'python',
        'java': 'java',
        'jar': 'java',
        'cpp': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp',
        'c': 'c',
        'h': 'c',
        'hpp': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'xml': 'visualstudio',
        'svg': 'svg',
        'png': 'image',
        'jpg': 'image',
        'jpeg': 'image',
        'gif': 'image',
        'bmp': 'image',
        'webp': 'image',
        'ico': 'favicon',
        'mp4': 'video',
        'webm': 'video',
        'avi': 'video',
        'mov': 'video',
        'mp3': 'audio',
        'wav': 'audio',
        'ogg': 'audio',
        'pdf': 'pdf',
        'txt': 'default',
        'log': 'log',
        'sh': 'console',
        'bash': 'console',
        'zsh': 'console',
        'bat': 'powershell',
        'cmd': 'powershell',
        'ps1': 'powershell',
        'vue': 'vue',
        'yaml': 'yaml',
        'yml': 'yaml',
        'sql': 'sql',
        'sh': 'shell',
        'txt': 'plaintext'
    };

    const iconKey = extMap[ext];
    const icon = (iconKey ? fileIcons[iconKey] : null) || fileIcons.default;
    // Return a fallback SVG if icon is undefined
    if (!icon) {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="#90a4ae"><path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4l-4-4H2zm8 0v4h4L10 0z"/></svg>`;
    }
    return icon;
}

function getFolderIcon(folderName, isOpen) {
    const name = String(folderName || '').toLowerCase();

    const base = fileIcons.folderbase || fileIcons.default;
    const baseOpen = fileIcons.folderbaseopen || base;

    const iconKeyMap = {
        src: 'foldersrc',
        source: 'foldersrc',
        assets: 'folderimages',
        asset: 'folderimages',
        images: 'folderimages',
        img: 'folderimages',
        docs: 'foldermarkdown',
        doc: 'foldermarkdown',
        test: 'foldertest',
        tests: 'foldertest',
        node_modules: 'foldernode',
        public: 'folderpublic',
        server: 'folderserver',
        client: 'folderclient',
        build: 'folderdist',
        dist: 'folderdist'
    };

    const key = iconKeyMap[name];
    if (!key) {
        return isOpen ? baseOpen : base;
    }

    const openKey = `${key}open`;
    const closedIcon = fileIcons[key] || base;
    const openIcon = fileIcons[openKey] || fileIcons[key] || baseOpen;
    return isOpen ? openIcon : closedIcon;
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
            const isExpandedInitially = expandedFolders.has(item.path);
            const iconToUse = getFolderIcon(item.name, isExpandedInitially);
            folderHeader.innerHTML = `
                <span class="tree-arrow">▶</span>
                <span class="tree-icon">${iconToUse}</span>
                <span>${item.name}</span>
            `;

            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children';

            if (expandedFolders.has(item.path)) {
                childrenDiv.classList.add('expanded');
                folderHeader.querySelector('.tree-arrow').classList.add('expanded');
                // Ensure children are loaded if expanded
                if (!item.children || item.children.length === 0) {
                    ipcRenderer.send('load-folder-contents', item.path);
                    item.element = childrenDiv;
                }
            }

            folderHeader.onclick = (e) => {
                e.stopPropagation();
                const arrow = folderHeader.querySelector('.tree-arrow');
                const iconEl = folderHeader.querySelector('.tree-icon');
                const isExpanded = childrenDiv.classList.contains('expanded');

                if (isExpanded) {
                    childrenDiv.classList.remove('expanded');
                    arrow.classList.remove('expanded');
                    if (iconEl) iconEl.innerHTML = getFolderIcon(item.name, false);
                    expandedFolders.delete(item.path);
                }
                else {
                    if (item.children.length === 0) {
                        ipcRenderer.send('load-folder-contents', item.path);
                        item.element = childrenDiv;
                    }
                    childrenDiv.classList.add('expanded');
                    arrow.classList.add('expanded');
                    if (iconEl) iconEl.innerHTML = getFolderIcon(item.name, true);
                    expandedFolders.add(item.path);
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
        }
        else {
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

// Helper to safely get folder name
function getSafeFolderName(name, folderPath) {
    if (name && name !== 'undefined' && name !== 'null') return name;
    if (folderPath) {
        try {
            return pathModule.basename(folderPath);
        } catch (e) {
            return 'Project';
        }
    }
    return 'Project';
}

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

    // Clear expanded folders when opening a NEW root folder to avoid state pollution
    expandedFolders = new Set();
    window.currentFolder = data;
    folderStructure = data.structure;

    console.log('Folder opened data:', data); // Debugging

    const safeName = getSafeFolderName(data.name, data.path);
    // Update data object to ensure consistency
    data.name = safeName;

    window.currentFolder = data;
    folderStructure = data.structure;

    const container = document.getElementById('folder-tree');
    container.innerHTML = `<div class="folder-name">${safeName}</div>`;

    renderFolderTree(data.structure, container, 0);
});

ipcRenderer.on('folder-refreshed', (event, { path: folderPath, structure }) => {
    if (window.currentFolder && window.currentFolder.path === folderPath) {
        folderStructure = structure;
        const container = document.getElementById('folder-tree');
        const safeName = getSafeFolderName(window.currentFolder.name, window.currentFolder.path);
        container.innerHTML = `<div class="folder-name">${safeName}</div>`;
        renderFolderTree(folderStructure, container, 0);
    }
});

// Fonction pour fermer tous les fichiers
function closeAllFiles() {
    // Vérifier s'il y a des fichiers modifiés
    const hasModified = openFiles.some(f => f.modified);
    if (hasModified) {
        if (!confirm(t('exitWithUnsaved'))) {
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
    const { path: folderPath, structure } = data;

    // Case for sub-folder expansion
    if (window.currentFolder && window.currentFolder.path !== folderPath) {
        const item = findItemByPath(folderStructure, folderPath);
        if (item && item.element) {
            item.children = structure;
            renderFolderTree(structure, item.element, getItemLevel(folderPath));
        }
    } else {
        // Case for root folder load/reload
        if (window.currentFolder && window.currentFolder.path === folderPath) {
            closeAllFiles();
        }

        // Robust name generation using helper
        const safeName = getSafeFolderName(null, folderPath);

        window.currentFolder = { path: folderPath, name: safeName };
        folderStructure = structure;

        const container = document.getElementById('folder-tree');
        container.innerHTML = `<div class="folder-name">${safeName}</div>`;
        renderFolderTree(structure, container, 0);
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
    document.getElementById('setting-ai-enabled').checked = settings.enableAI !== false;
    document.getElementById('setting-language').value = settings.language;
    document.getElementById('setting-theme').value = settings.theme;
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
    if (editor) editor.focus();
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

function toggleAIEnabled() {
    settings.enableAI = document.getElementById('setting-ai-enabled').checked;
    updateAIVisibility();
    saveSettings();
}

function updateAIVisibility() {
    const btn = document.getElementById('ai-toggle-btn');
    if (btn) {
        btn.style.display = settings.enableAI !== false ? 'flex' : 'none';
    }
    const panel = document.getElementById('ai-panel');
    if (panel && settings.enableAI === false) {
        panel.classList.remove('open');
        isAIPanelOpen = false;
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
    // Collect settings
    const currentSettings = {
        theme: settings.theme,
        language: settings.language,
        autosave: settings.autosave,
        enableAI: settings.enableAI,
        // Save providers config if needed, usually handled by aiManager
    };

    if (window.currentFolder) {
        currentSettings.lastOpenedFolder = window.currentFolder.path;
    }

    ipcRenderer.send('save-settings', currentSettings);
}

function closeApp() {
    saveSettings(); // Save state before closing
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

function updateUIText() {
    // Update static HTML elements with translations
    if (document.getElementById('settings-title')) document.getElementById('settings-title').textContent = t('settings');
    if (document.getElementById('setting-autosave-span')) document.getElementById('setting-autosave-span').textContent = t('autoSave');
    if (document.getElementById('setting-ai-enabled-span')) document.getElementById('setting-ai-enabled-span').textContent = t('enableAI');
    if (document.getElementById('setting-language-label')) document.getElementById('setting-language-label').textContent = t('language');
    if (document.getElementById('setting-theme-label')) document.getElementById('setting-theme-label').textContent = t('theme');

    if (document.getElementById('welcome-title')) document.getElementById('welcome-title').textContent = t('welcomeTitle');
    if (document.getElementById('welcome-subtitle')) document.getElementById('welcome-subtitle').textContent = t('welcomeSubtitle');
    if (document.getElementById('welcome-new-file-btn')) document.getElementById('welcome-new-file-btn').textContent = t('newFile');
    if (document.getElementById('welcome-open-folder-btn')) document.getElementById('welcome-open-folder-btn').textContent = t('openFolder');

    if (document.getElementById('no-folder-p')) document.getElementById('no-folder-p').textContent = t('noFolderOpened');
    if (document.getElementById('no-folder-btn')) document.getElementById('no-folder-btn').textContent = t('openFolder');

    if (document.getElementById('sidebar-title')) document.getElementById('sidebar-title').textContent = t('explorer');

    // Custom menubar (HTML)
    if (document.getElementById('menu-file')) document.getElementById('menu-file').childNodes[0].textContent = t('file') + '\n                        ';
    if (document.getElementById('menu-edit')) document.getElementById('menu-edit').childNodes[0].textContent = t('edit') + '\n                        ';
    if (document.getElementById('menu-view')) document.getElementById('menu-view').childNodes[0].textContent = t('view') + '\n                        ';
    if (document.getElementById('menu-help')) document.getElementById('menu-help').childNodes[0].textContent = t('help') + '\n                        ';

    if (document.getElementById('menu-file-new')) document.getElementById('menu-file-new').childNodes[0].textContent = t('newFile') + ' ';
    if (document.getElementById('menu-file-open')) document.getElementById('menu-file-open').childNodes[0].textContent = t('openFile') + ' ';
    if (document.getElementById('menu-file-open-folder')) document.getElementById('menu-file-open-folder').childNodes[0].textContent = t('openFolder') + '\n                                ';
    if (document.getElementById('menu-file-save')) document.getElementById('menu-file-save').childNodes[0].textContent = t('save') + ' ';
    if (document.getElementById('menu-file-save-as')) document.getElementById('menu-file-save-as').childNodes[0].textContent = t('saveAs') + ' ';
    if (document.getElementById('menu-file-settings')) document.getElementById('menu-file-settings').textContent = t('settings');
    if (document.getElementById('menu-file-exit')) document.getElementById('menu-file-exit').childNodes[0].textContent = t('exit') + ' ';

    if (document.getElementById('menu-edit-undo')) document.getElementById('menu-edit-undo').childNodes[0].textContent = t('undo') + ' ';
    if (document.getElementById('menu-edit-redo')) document.getElementById('menu-edit-redo').childNodes[0].textContent = t('redo') + ' ';
    if (document.getElementById('menu-edit-cut')) document.getElementById('menu-edit-cut').childNodes[0].textContent = t('cut') + ' ';
    if (document.getElementById('menu-edit-copy')) document.getElementById('menu-edit-copy').childNodes[0].textContent = t('copy') + ' ';
    if (document.getElementById('menu-edit-paste')) document.getElementById('menu-edit-paste').childNodes[0].textContent = t('paste') + ' ';

    if (document.getElementById('menu-view-toggle-terminal')) document.getElementById('menu-view-toggle-terminal').childNodes[0].textContent = t('toggleTerminal') + ' ';
    if (document.getElementById('menu-view-toggle-fullscreen')) document.getElementById('menu-view-toggle-fullscreen').childNodes[0].textContent = t('toggleFullScreen') + ' ';

    if (document.getElementById('menu-help-about')) document.getElementById('menu-help-about').textContent = t('about');

    // Sidebar tooltips
    const sidebarButtons = document.querySelectorAll('.sidebar-actions .sidebar-btn');
    if (sidebarButtons && sidebarButtons.length >= 5) {
        if (sidebarButtons[0]) sidebarButtons[0].title = t('newFile');
        if (sidebarButtons[1]) sidebarButtons[1].title = t('newFolder');
        if (sidebarButtons[2]) sidebarButtons[2].title = t('openFolder');
        if (sidebarButtons[3]) sidebarButtons[3].title = t('refresh');
    }

    // Context menu labels
    if (document.getElementById('context-new-file-label')) document.getElementById('context-new-file-label').textContent = t('newFile');
    if (document.getElementById('context-new-folder-label')) document.getElementById('context-new-folder-label').textContent = t('newFolder');
    if (document.getElementById('context-rename-label')) document.getElementById('context-rename-label').textContent = t('rename');
    if (document.getElementById('context-delete-label')) document.getElementById('context-delete-label').textContent = t('delete');

    // AI toggle tooltip
    if (document.getElementById('ai-toggle-btn')) document.getElementById('ai-toggle-btn').title = t('aiAssistant');

    // AI Panel
    if (document.getElementById('ai-title-text') && aiManager) document.getElementById('ai-title-text').textContent = t('aiAssistant') + ` (${aiManager.getCurrentProvider().name})`;
    if (document.getElementById('ai-welcome-title')) document.getElementById('ai-welcome-title').textContent = t('aiWelcomeTitle');
    if (document.getElementById('ai-welcome-subtitle')) document.getElementById('ai-welcome-subtitle').textContent = t('aiWelcomeSubtitle');
    if (document.getElementById('ai-input')) document.getElementById('ai-input').placeholder = t('aiAskPlaceholder');

    if (document.getElementById('ai-quick-explain')) document.getElementById('ai-quick-explain').textContent = t('aiExplainCode');
    if (document.getElementById('ai-quick-fix')) document.getElementById('ai-quick-fix').textContent = t('aiFixIssues');
    if (document.getElementById('ai-quick-refactor')) document.getElementById('ai-quick-refactor').textContent = t('aiRefactor');
    if (document.getElementById('ai-quick-comment')) document.getElementById('ai-quick-comment').textContent = t('aiAddComments');

    // Global mouseup to reset user-select, fixing sticky input issues
    document.addEventListener('mouseup', () => {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    });
    // AI Settings
    if (document.getElementById('ai-settings-title')) document.getElementById('ai-settings-title').textContent = t('aiSettings');
    if (document.getElementById('ai-provider-label')) document.getElementById('ai-provider-label').textContent = t('aiProvider');
    if (document.getElementById('ai-api-key-label')) document.getElementById('ai-api-key-label').textContent = t('apiKey');
    if (document.getElementById('ai-model-label')) document.getElementById('ai-model-label').textContent = t('model');
    if (document.getElementById('ai-temperature-label')) document.getElementById('ai-temperature-label').textContent = t('temperature');
    if (document.getElementById('ai-max-tokens-label')) document.getElementById('ai-max-tokens-label').textContent = t('maxTokens');
    if (document.getElementById('ai-endpoint-label')) document.getElementById('ai-endpoint-label').textContent = t('endpointUrl');

    if (document.getElementById('ai-save-key-btn')) document.getElementById('ai-save-key-btn').textContent = t('saveKey');
    if (document.getElementById('ai-cancel-btn')) document.getElementById('ai-cancel-btn').textContent = t('cancel');
    if (document.getElementById('ai-save-btn')) document.getElementById('ai-save-btn').textContent = t('save');
}

// Global mouseup to reset user-select, fixing sticky input issues
document.addEventListener('mouseup', () => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
});

// Expose all functions to window for onclick handlers
window.createNewFile = createNewFile;
window.openFile = openFile;
window.openFolder = openFolder;
window.closeFile = closeFile;
window.toggleTerminal = toggleTerminal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleAutoSave = toggleAutoSave;
window.toggleAIEnabled = toggleAIEnabled;
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

// Initialize AI Manager
async function initializeAI() {
    try {
        // Enable @electron/remote for AI Manager
        const remote = require('@electron/remote');
        aiManager = new AIManager();
        console.log('AI Manager initialized successfully');

        // AI Manager is ready - no pre-loading needed for Groq
        console.log('AI Manager ready with provider:', aiManager.config.currentProvider);

        updateAIUI();
    } catch (err) {
        console.error('Failed to initialize AI Manager:', err);
    }
}

// AI Panel Functions
function toggleAIPanel() {
    const panel = document.getElementById('ai-panel');
    isAIPanelOpen = !isAIPanelOpen;

    if (isAIPanelOpen) {
        panel.classList.add('open');
    } else {
        panel.classList.remove('open');
    }
}

function clearAIChat() {
    if (confirm(t('aiClearConfirm'))) {
        const container = document.getElementById('ai-chat-container');
        container.innerHTML = `
            <div class="ai-welcome">
                <div class="ai-icon">${fileIcons.ai || ''}</div>
                <h3 id="ai-welcome-title">${t('aiWelcomeTitle')}</h3>
                <p id="ai-welcome-subtitle">${t('aiWelcomeSubtitle')}</p>
                <div class="ai-quick-actions">
                    <button class="ai-quick-btn" onclick="aiQuickAction('explain')">
                        <span>💡</span> <span>${t('aiExplainCode')}</span>
                    </button>
                    <button class="ai-quick-btn" onclick="aiQuickAction('fix')">
                        <span>🔧</span> <span>${t('aiFixIssues')}</span>
                    </button>
                    <button class="ai-quick-btn" onclick="aiQuickAction('refactor')">
                        <span>✨</span> <span>${t('aiRefactor')}</span>
                    </button>
                    <button class="ai-quick-btn" onclick="aiQuickAction('comment')">
                        <span>📝</span> <span>${t('aiAddComments')}</span>
                    </button>
                </div>
            </div>
        `;
        if (aiManager) {
            aiManager.clearHistory();
        }
    }
}

function addAIMessage(content, type = 'assistant') {
    const container = document.getElementById('ai-chat-container');

    // Remove welcome screen if present
    const welcome = container.querySelector('.ai-welcome');
    if (welcome) {
        welcome.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${type}`;

    if (type === 'loading') {
        messageDiv.innerHTML = `
            <div class="ai-message-content">
                ${content}
                <div class="ai-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
    } else {
        const header = type === 'user' ? 'You' : (type === 'error' ? t('aiError') : 'AI');
        messageDiv.innerHTML = `
            <div class="ai-message-header">${header}</div>
            <div class="ai-message-content">${formatAIMessage(content)}</div>
        `;
    }

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    return messageDiv;
}

function formatAIMessage(content) {
    try {
        // Configure marked to handle line breaks
        marked.use({
            breaks: true,
            gfm: true
        });
        // Check for array (rare Puter case) and other non-strings
        let strContent = content;
        if (Array.isArray(content)) {
            strContent = content.join('\n');
        } else if (typeof content === 'object') {
            strContent = JSON.stringify(content, null, 2);
        } else {
            strContent = String(content || '');
        }

        return marked.parse(strContent);
    } catch (e) {
        console.error('Markdown parsing error:', e);
        return content;
    }
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();

    if (!message) return;

    if (!aiManager) {
        addAIMessage(t('aiProviderNotConfigured'), 'error');
        return;
    }

    // Update model from quick selector (if provided)
    const modelQuick = document.getElementById('ai-model-quick');
    const requestedModel = modelQuick?.value?.trim();
    if (requestedModel && aiManager) {
        const providerId = aiManager.config?.currentProvider;
        if (providerId) {
            aiManager.setModel(providerId, requestedModel);
            aiManager.saveConfig();
            updateAIUI();
        }
    }

    // Always include useful context automatically (no checkbox)
    let messageToSend = message;
    try {
        const ctx = buildAIAutoContext();
        if (ctx) {
            messageToSend += `\n\n${ctx}`;
        }
    } catch (e) {
        console.warn('Failed to build AI auto context:', e);
    }

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Add user message (show original short message to user)
    addAIMessage(message, 'user');

    // Show loading
    const loadingMsg = addAIMessage(t('aiThinking'), 'loading');

    try {
        const response = await aiManager.chat(messageToSend);
        loadingMsg.remove();
        addAIMessage(response, 'assistant');
    } catch (error) {
        console.error('AI Error:', error);
        loadingMsg.remove();

        // More detailed error message
        let errorMsg = error.message || 'Failed to get AI response';

        // Add helpful hints for common errors
        if (errorMsg.includes('API key')) {
            errorMsg = 'Invalid or missing API key. Please check your AI settings.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
            errorMsg = 'Network error. Please check your internet connection.';
        }

        addAIMessage(errorMsg, 'error');
    }
}

async function aiQuickAction(action) {
    if (!aiManager) {
        addAIMessage(t('aiProviderNotConfigured'), 'error');
        return;
    }

    if (!editor || currentFileIndex < 0) {
        addAIMessage(t('aiNoCodeSelected'), 'error');
        return;
    }

    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    const code = selectedText || editor.getValue();
    const language = openFiles[currentFileIndex].language;

    if (!code.trim()) {
        addAIMessage(t('aiNoCodeSelected'), 'error');
        return;
    }

    // Open AI panel if closed
    if (!isAIPanelOpen) {
        toggleAIPanel();
    }

    // Show loading
    const loadingMsg = addAIMessage(t('aiThinking'), 'loading');

    try {
        let response;
        switch (action) {
            case 'explain':
                response = await aiManager.explainCode(code, language);
                break;
            case 'fix':
                response = await aiManager.fixCode(code, language, 'Find and fix any issues');
                break;
            case 'refactor':
                response = await aiManager.refactorCode(code, language);
                break;
            case 'comment':
                response = await aiManager.addComments(code, language);
                break;
        }

        loadingMsg.remove();
        addAIMessage(response, 'assistant');
    } catch (error) {
        console.error('AI Quick Action Error:', error);
        loadingMsg.remove();

        let errorMsg = error.message || 'Failed to process request';
        addAIMessage(errorMsg, 'error');
    }
}

// AI Settings Functions
function openAISettings() {
    document.getElementById('ai-settings-modal').style.display = 'flex';

    if (aiManager) {
        const config = aiManager.config;
        document.getElementById('ai-provider-select').value = config.currentProvider;
        document.getElementById('ai-model-input').value = config.models[config.currentProvider];
        document.getElementById('ai-temperature-input').value = config.temperature;
        document.getElementById('ai-temperature-value').textContent = config.temperature;
        document.getElementById('ai-max-tokens-input').value = config.maxTokens;

        changeAIProvider();
    }
}

function closeAISettings() {
    document.getElementById('ai-settings-modal').style.display = 'none';
    if (editor) editor.focus();
}

function changeAIProvider() {
    const provider = document.getElementById('ai-provider-select').value;
    const apiKeyContainer = document.getElementById('ai-api-key-container');
    const endpointContainer = document.getElementById('ai-endpoint-container');

    // Show/hide API key input
    if (['claude', 'openai', 'gemini', 'openrouter', 'groq'].includes(provider)) {
        apiKeyContainer.style.display = 'block';
        const currentKey = aiManager?.config.apiKeys[provider] || '';
        document.getElementById('ai-api-key-input').value = currentKey ? '••••••••' : '';

        // Add help text for Groq
        if (provider === 'groq') {
            const helpText = apiKeyContainer.querySelector('.api-key-help') || document.createElement('small');
            helpText.className = 'api-key-help';
            helpText.style.cssText = 'color: #858585; font-size: 11px; margin-top: 4px; display: block;';
            helpText.innerHTML = '🆓 Get a free API key at <a href="https://console.groq.com/keys" target="_blank" style="color: #667eea;">console.groq.com/keys</a>';
            if (!apiKeyContainer.querySelector('.api-key-help')) {
                apiKeyContainer.appendChild(helpText);
            }
        } else {
            const helpText = apiKeyContainer.querySelector('.api-key-help');
            if (helpText) helpText.remove();
        }
    } else {
        apiKeyContainer.style.display = 'none';
    }

    // Show/hide endpoint input
    if (['lmstudio', 'ollama'].includes(provider)) {
        endpointContainer.style.display = 'block';
        const endpoint = aiManager?.config.endpoints[provider] ||
            (provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434');
        document.getElementById('ai-endpoint-input').value = endpoint;
    } else {
        endpointContainer.style.display = 'none';
    }

    // Generate model suggestions
    const modelList = document.getElementById('ai-model-list');
    modelList.innerHTML = '';

    const models = {
        puter: [
            // Popular / Stable
            'claude-3-5-sonnet-latest',
            'gpt-4o',
            'gpt-4o-mini',
            'gemini-2.0-flash',
            'deepseek-chat',
            'deepseek-reasoner',
            'mistral-large-latest',

            // Advanced / Experimental
            'claude-3-7-sonnet-latest',
            'claude-opus-4-5-latest',
            'gpt-5.2-chat-latest',
            'o1',
            'o1-mini',
            'o1-pro',
            'o3',
            'grok-3',
            'grok-3-mini',

            // Others
            'claude-3-5-haiku-20241022',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'mistral-small-latest',
            'pixtral-large-latest',
            'codestral-latest'
        ],
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
        gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
        ollama: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5-coder'],
        lmstudio: ['local-model']
    };

    if (models[provider]) {
        models[provider].forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            modelList.appendChild(option);
        });
    }

    // Update model input
    if (aiManager) {
        document.getElementById('ai-model-input').value = aiManager.config.models[provider];
    }
}

function saveAIApiKey() {
    const provider = document.getElementById('ai-provider-select').value;
    const apiKey = document.getElementById('ai-api-key-input').value;

    if (apiKey && apiKey !== '••••••••') {
        aiManager.setApiKey(provider, apiKey);
        alert('API Key saved successfully!');
    }
}

function saveAISettings() {
    const provider = document.getElementById('ai-provider-select').value;
    const model = document.getElementById('ai-model-input').value;
    const temperature = parseFloat(document.getElementById('ai-temperature-input').value);
    const maxTokens = parseInt(document.getElementById('ai-max-tokens-input').value);

    if (aiManager) {
        aiManager.setProvider(provider);
        aiManager.setModel(provider, model);
        aiManager.config.temperature = temperature;
        aiManager.config.maxTokens = maxTokens;

        // Save endpoint for local providers
        if (['lmstudio', 'ollama'].includes(provider)) {
            const endpoint = document.getElementById('ai-endpoint-input').value;
            aiManager.config.endpoints[provider] = endpoint;
        }

        aiManager.saveConfig();
        updateAIUI();
    }

    closeAISettings();
}

function updateAIUI() {
    if (!aiManager) return;

    const provider = aiManager.getCurrentProvider();
    document.getElementById('ai-title-text').textContent = `${t('aiAssistant')} (${provider.name})`;

    const modelQuick = document.getElementById('ai-model-quick');
    if (modelQuick) {
        const providerId = aiManager.config?.currentProvider;
        const currentModel = providerId ? aiManager.config?.models?.[providerId] : '';
        if (currentModel && modelQuick.value !== currentModel) {
            modelQuick.value = currentModel;
        }
    }
}

// Auto-resize AI input
document.addEventListener('DOMContentLoaded', function () {
    const aiInput = document.getElementById('ai-input');
    if (aiInput) {
        aiInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        aiInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAIMessage();
            }
        });
    }

    // Temperature slider update
    const tempSlider = document.getElementById('ai-temperature-input');
    if (tempSlider) {
        tempSlider.addEventListener('input', function () {
            document.getElementById('ai-temperature-value').textContent = this.value;
        });
    }
});

// Expose AI functions to window
window.toggleAIPanel = toggleAIPanel;
window.clearAIChat = clearAIChat;
window.sendAIMessage = sendAIMessage;
window.aiQuickAction = aiQuickAction;
window.openAISettings = openAISettings;
window.closeAISettings = closeAISettings;
window.changeAIProvider = changeAIProvider;
window.saveAIApiKey = saveAIApiKey;
window.saveAISettings = saveAISettings;

// Initialize AI on load
setTimeout(initializeAI, 1000);

// Debug: log when script is fully loaded
console.log('ByteCode renderer.js loaded successfully');
console.log('Available functions:', Object.keys(window).filter(k => typeof window[k] === 'function' && ['createNewFile', 'openFile', 'openFolder'].includes(k)));