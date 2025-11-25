// Variables globales
let fileCounter = 1;
let editor;
let openFiles = [];
let currentFileIndex = -1;
let currentFolder = null;
let folderStructure = [];
let ipcRenderer;
let pathModule;

// Initialisation immédiate des modules Electron (avant Monaco)
const electron = require('electron');
ipcRenderer = electron.ipcRenderer;
pathModule = require('path');

// Exposer les fonctions au scope global pour les onclick handlers
window.createNewFile = createNewFile;
window.openFile = openFile;
window.openFolder = openFolder;
window.closeFile = closeFile;

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
        theme: 'vs-dark',
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
        if (currentFileIndex >= 0) {
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

    monaco.editor.setTheme('custom-dark');
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

function getIconForFile(filename, isFolder) {
    if (isFolder) return '📁';

    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'js': '📜',
        'jsx': '⚛️',
        'ts': '📘',
        'tsx': '⚛️',
        'html': '🌐',
        'css': '🎨',
        'scss': '🎨',
        'json': '📋',
        'md': '📝',
        'py': '🐍',
        'java': '☕',
        'cpp': '⚙️',
        'c': '⚙️',
        'php': '🐘',
        'rb': '💎',
        'go': '🔵',
        'rs': '🦀',
        'xml': '📰',
        'png': '🖼️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'gif': '🖼️',
        'svg': '🎨',
        'txt': '📄'
    };
    return iconMap[ext] || '📄';
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

    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('editor').style.display = 'block';

    if (editor) {
        editor.setValue(file.content);
        const model = editor.getModel();
        if (model) {
            monaco.editor.setModelLanguage(model, file.language);
        }
        editor.focus();
    }

    updateTitleBar();
    updateStatusBar();
    updateEditorTabs();
    updateTreeSelection();
}

function closeFile(index) {
    if (openFiles[index].modified) {
        const response = confirm(`${openFiles[index].name} has unsaved changes. Close anyway?`);
        if (!response) return;
    }

    openFiles.splice(index, 1);

    if (openFiles.length === 0) {
        currentFileIndex = -1;
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('editor').style.display = 'none';
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
    currentFolder = data;
    folderStructure = data.structure;

    const container = document.getElementById('folder-tree');
    container.innerHTML = `<div class="folder-name">${data.name}</div>`;

    renderFolderTree(data.structure, container, 0);
});

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
    currentFolder = null;
    folderStructure = [];
    const container = document.getElementById('folder-tree');
    container.innerHTML = `
        <div class="no-folder">
            <p>No folder opened</p>
            <button class="no-folder-btn" onclick="openFolder()">Open Folder</button>
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
    if (!currentFolder) return 0;
    const relative = itemPath.replace(currentFolder.path, '');
    return (relative.match(/[\/\\]/g) || []).length;
}