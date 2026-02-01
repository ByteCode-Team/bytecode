// ByteCode Extension System
// Format: .bcext (ZIP containing manifest.json + JS files)

class ExtensionManager {
    constructor() {
        // Use global modules from renderer.js
        this._fs = typeof fs !== 'undefined' ? fs : require('fs');
        this._path = typeof pathModule !== 'undefined' ? pathModule : require('path');
        this._ipc = typeof ipcRenderer !== 'undefined' ? ipcRenderer : require('electron').ipcRenderer;

        this.extensions = new Map();
        this.hooks = {
            'editor:ready': [],
            'editor:change': [],
            'file:open': [],
            'file:save': [],
            'file:close': [],
            'folder:open': [],
            'terminal:command': [],
            'ai:message': [],
            'ai:response': [],
            'menu:init': [],
            'statusbar:init': [],
            'context:init': []
        };

        this.api = this.createAPI();
        this.extensionsPath = this.getExtensionsPath();
        this.ensureExtensionsFolder();
    }

    getExtensionsPath() {
        try {
            const { app } = require('@electron/remote');
            return this._path.join(app.getPath('userData'), 'extensions');
        } catch (e) {
            // Fallback for dev - use project extensions folder
            return this._path.join(process.cwd(), 'extensions');
        }
    }

    ensureExtensionsFolder() {
        if (!this._fs.existsSync(this.extensionsPath)) {
            this._fs.mkdirSync(this.extensionsPath, { recursive: true });
        }
    }

    // API exposed to extensions
    createAPI() {
        const self = this;
        return {
            // Editor API
            editor: {
                getValue: () => window.editor?.getValue() || '',
                setValue: (value) => window.editor?.setValue(value),
                getSelection: () => {
                    if (!window.editor) return '';
                    const sel = window.editor.getSelection();
                    return window.editor.getModel()?.getValueInRange(sel) || '';
                },
                insertText: (text) => {
                    if (!window.editor) return;
                    const selection = window.editor.getSelection();
                    window.editor.executeEdits('extension', [{
                        range: selection,
                        text: text,
                        forceMoveMarkers: true
                    }]);
                },
                getLanguage: () => {
                    if (window.currentFileIndex >= 0 && window.openFiles) {
                        return window.openFiles[window.currentFileIndex]?.language || 'plaintext';
                    }
                    return 'plaintext';
                },
                getCursorPosition: () => window.editor?.getPosition() || { lineNumber: 1, column: 1 },
                setCursorPosition: (line, col) => window.editor?.setPosition({ lineNumber: line, column: col }),
                focus: () => window.editor?.focus()
            },

            // File API
            files: {
                getCurrentFile: () => {
                    if (window.currentFileIndex >= 0 && window.openFiles) {
                        return { ...window.openFiles[window.currentFileIndex] };
                    }
                    return null;
                },
                getOpenFiles: () => (window.openFiles || []).map(f => ({ ...f })),
                openFile: (filePath) => self._ipc.send('read-file', filePath),
                saveCurrentFile: () => window.saveCurrentFile?.(),
                createFile: (name, content = '') => {
                    if (window.createNewFile) {
                        window.createNewFile();
                        if (window.editor && content) {
                            window.editor.setValue(content);
                        }
                    }
                },
                readFile: (filePath) => {
                    try {
                        return self._fs.readFileSync(filePath, 'utf8');
                    } catch (e) {
                        return null;
                    }
                },
                writeFile: (filePath, content) => {
                    try {
                        self._fs.writeFileSync(filePath, content, 'utf8');
                        return true;
                    } catch (e) {
                        return false;
                    }
                }
            },

            // Workspace API
            workspace: {
                getFolder: () => window.currentFolder ? { ...window.currentFolder } : null,
                refresh: () => {
                    if (window.currentFolder) {
                        self._ipc.send('refresh-folder', window.currentFolder.path);
                    }
                }
            },

            // UI API
            ui: {
                showNotification: (message, type = 'info') => {
                    self.showNotification(message, type);
                },
                showInputDialog: (title, placeholder = '') => {
                    return new Promise((resolve) => {
                        const result = prompt(title, placeholder);
                        resolve(result);
                    });
                },
                addStatusBarItem: (id, text, onClick) => {
                    self.addStatusBarItem(id, text, onClick);
                },
                updateStatusBarItem: (id, text) => {
                    const item = document.getElementById(`ext-status-${id}`);
                    if (item) item.textContent = text;
                },
                removeStatusBarItem: (id) => {
                    const item = document.getElementById(`ext-status-${id}`);
                    if (item) item.remove();
                },
                addMenuItem: (menuId, item) => {
                    self.addMenuItem(menuId, item);
                },
                addContextMenuItem: (item) => {
                    self.addContextMenuItem(item);
                },
                addSidebarPanel: (id, title, content) => {
                    self.addSidebarPanel(id, title, content);
                }
            },

            // Terminal API
            terminal: {
                execute: (command) => {
                    return new Promise((resolve) => {
                        self._ipc.send('execute-terminal-command', {
                            command,
                            cwd: window.currentFolder?.path || process.cwd()
                        });
                        self._ipc.once('terminal-command-result', (e, res) => {
                            resolve(res);
                        });
                    });
                },
                show: () => window.toggleTerminal?.(),
                write: (text) => {
                    if (window.terminalManager) {
                        window.terminalManager.write(text);
                    }
                }
            },

            // AI API
            ai: {
                chat: async (message) => {
                    if (window.aiManager) {
                        return await window.aiManager.chat(message);
                    }
                    throw new Error('AI not available');
                },
                getProvider: () => window.aiManager?.getCurrentProvider() || null
            },

            // Hooks API
            hooks: {
                on: (event, callback) => {
                    if (self.hooks[event]) {
                        self.hooks[event].push(callback);
                    }
                },
                off: (event, callback) => {
                    if (self.hooks[event]) {
                        const idx = self.hooks[event].indexOf(callback);
                        if (idx > -1) self.hooks[event].splice(idx, 1);
                    }
                }
            },

            // Storage API (per-extension)
            storage: {
                get: (extId, key) => {
                    try {
                        const data = JSON.parse(localStorage.getItem(`bcext_${extId}`) || '{}');
                        return data[key];
                    } catch (e) {
                        return undefined;
                    }
                },
                set: (extId, key, value) => {
                    try {
                        const data = JSON.parse(localStorage.getItem(`bcext_${extId}`) || '{}');
                        data[key] = value;
                        localStorage.setItem(`bcext_${extId}`, JSON.stringify(data));
                    } catch (e) { }
                },
                remove: (extId, key) => {
                    try {
                        const data = JSON.parse(localStorage.getItem(`bcext_${extId}`) || '{}');
                        delete data[key];
                        localStorage.setItem(`bcext_${extId}`, JSON.stringify(data));
                    } catch (e) { }
                }
            },

            // Utils
            utils: {
                path: self._path,
                fs: self._fs
            }
        };
    }

    // Trigger hooks
    trigger(event, data) {
        if (this.hooks[event]) {
            for (const callback of this.hooks[event]) {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Extension hook error (${event}):`, e);
                }
            }
        }
    }

    // Load extension from folder
    async loadExtension(extPath) {
        try {
            const manifestPath = this._path.join(extPath, 'manifest.json');
            if (!this._fs.existsSync(manifestPath)) {
                console.error('Extension missing manifest.json:', extPath);
                return false;
            }

            const manifest = JSON.parse(this._fs.readFileSync(manifestPath, 'utf8'));

            if (!manifest.id || !manifest.name || !manifest.main) {
                console.error('Invalid extension manifest:', extPath);
                return false;
            }

            // Check if already loaded
            if (this.extensions.has(manifest.id)) {
                console.warn('Extension already loaded:', manifest.id);
                return false;
            }

            // Load main script
            const mainPath = this._path.join(extPath, manifest.main);
            if (!this._fs.existsSync(mainPath)) {
                console.error('Extension main file not found:', mainPath);
                return false;
            }

            const code = this._fs.readFileSync(mainPath, 'utf8');

            // Create sandboxed context for extension
            const extensionContext = {
                bytecode: this.api,
                console: console,
                setTimeout: setTimeout,
                setInterval: setInterval,
                clearTimeout: clearTimeout,
                clearInterval: clearInterval,
                fetch: fetch,
                JSON: JSON,
                Math: Math,
                Date: Date,
                Array: Array,
                Object: Object,
                String: String,
                Number: Number,
                Boolean: Boolean,
                RegExp: RegExp,
                Promise: Promise,
                Map: Map,
                Set: Set
            };

            // Execute extension code
            const extensionFn = new Function(...Object.keys(extensionContext), code);
            const extensionExports = {};

            try {
                extensionFn.call(extensionExports, ...Object.values(extensionContext));
            } catch (e) {
                console.error('Extension execution error:', manifest.id, e);
                return false;
            }

            // Store extension info
            this.extensions.set(manifest.id, {
                manifest,
                path: extPath,
                exports: extensionExports,
                enabled: true
            });

            console.log(`Extension loaded: ${manifest.name} v${manifest.version || '1.0.0'}`);
            return true;

        } catch (e) {
            console.error('Failed to load extension:', extPath, e);
            return false;
        }
    }

    // Load all extensions from extensions folder
    async loadAllExtensions() {
        const pathsToCheck = [
            this.extensionsPath,
            this._path.join(process.cwd(), 'extensions') // Also check project folder
        ];

        // Get list of disabled extensions from localStorage
        let disabledExtensions = [];
        try {
            disabledExtensions = JSON.parse(localStorage.getItem('bytecode-disabled-extensions') || '[]');
        } catch (e) {
            disabledExtensions = [];
        }

        for (const extFolder of pathsToCheck) {
            if (!this._fs.existsSync(extFolder)) continue;

            try {
                const entries = this._fs.readdirSync(extFolder, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        // Skip disabled extensions
                        if (disabledExtensions.includes(entry.name)) {
                            console.log(`Skipping disabled extension: ${entry.name}`);
                            continue;
                        }

                        const extPath = this._path.join(extFolder, entry.name);
                        await this.loadExtension(extPath);
                    }
                }
            } catch (e) {
                console.warn('Could not read extensions folder:', extFolder, e);
            }
        }

        console.log(`Loaded ${this.extensions.size} extension(s)`);
    }

    // Install extension from .bcext file
    async installExtension(bcextPath) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(bcextPath);

            // Read manifest from zip
            const manifestEntry = zip.getEntry('manifest.json');
            if (!manifestEntry) {
                throw new Error('Invalid .bcext file: missing manifest.json');
            }

            const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

            if (!manifest.id || !manifest.name) {
                throw new Error('Invalid manifest: missing id or name');
            }

            // Extract to extensions folder
            const extPath = this._path.join(this.extensionsPath, manifest.id);

            if (this._fs.existsSync(extPath)) {
                // Update existing
                this._fs.rmSync(extPath, { recursive: true });
            }

            zip.extractAllTo(extPath, true);

            // Check for dependencies and install them
            if (manifest.dependencies || manifest.devDependencies) {
                const packageJsonPath = this._path.join(extPath, 'package.json');

                // If package.json doesn't exist, create one from manifest
                if (!this._fs.existsSync(packageJsonPath)) {
                    const packageJson = {
                        name: manifest.id,
                        version: manifest.version,
                        dependencies: manifest.dependencies || {},
                        devDependencies: manifest.devDependencies || {}
                    };
                    this._fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                }

                this.showNotification(`Installing dependencies for ${manifest.name}...`, 'info');

                await new Promise((resolve, reject) => {
                    const { exec } = require('child_process');
                    // Run npm install in the extension directory
                    // We install both dependencies and devDependencies as requested
                    exec('npm install', { cwd: extPath }, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`npm install error: ${error.message}`);
                            // We don't block installation on npm error, but we warn
                            this.showNotification(`Failed to install dependencies: ${error.message}`, 'error');
                            resolve(); // Continue anyway
                        } else {
                            console.log(`Dependencies installed for ${manifest.name}`);
                            resolve();
                        }
                    });
                });
            }

            // Load the extension
            await this.loadExtension(extPath);

            this.showNotification(`Extension "${manifest.name}" installed successfully!`, 'success');
            return true;

        } catch (e) {
            console.error('Failed to install extension:', e);
            this.showNotification(`Failed to install extension: ${e.message}`, 'error');
            return false;
        }
    }

    // Uninstall extension
    uninstallExtension(extId) {
        const ext = this.extensions.get(extId);
        if (!ext) return false;

        try {
            // Remove from disk
            if (this._fs.existsSync(ext.path)) {
                this._fs.rmSync(ext.path, { recursive: true });
            }

            // Remove from memory
            this.extensions.delete(extId);

            this.showNotification(`Extension "${ext.manifest.name}" uninstalled`, 'info');
            return true;
        } catch (e) {
            console.error('Failed to uninstall extension:', e);
            return false;
        }
    }

    // Get list of installed extensions
    getExtensions() {
        return Array.from(this.extensions.values()).map(ext => ({
            id: ext.manifest.id,
            name: ext.manifest.name,
            version: ext.manifest.version || '1.0.0',
            description: ext.manifest.description || '',
            author: ext.manifest.author || 'Unknown',
            enabled: ext.enabled
        }));
    }

    // Open extension installer dialog
    openInstallDialog() {
        this._ipc.send('open-extension-dialog');
    }

    // UI Helpers
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container') || this.createNotificationContainer();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(notification);

        setTimeout(() => notification.remove(), 5000);
    }

    createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
        return container;
    }

    addStatusBarItem(id, text, onClick) {
        const statusbar = document.querySelector('.statusbar');
        if (!statusbar) return;

        const item = document.createElement('div');
        item.id = `ext-status-${id}`;
        item.className = 'statusbar-item ext-statusbar-item';
        item.textContent = text;
        item.style.cursor = onClick ? 'pointer' : 'default';

        if (onClick) {
            item.addEventListener('click', onClick);
        }

        statusbar.appendChild(item);
    }

    addMenuItem(menuId, item) {
        const menu = document.querySelector(`#menu-${menuId} .dropdown-menu`);
        if (!menu) return;

        const menuItem = document.createElement('div');
        menuItem.className = 'dropdown-item';
        menuItem.innerHTML = `${item.label} ${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}`;
        menuItem.addEventListener('click', item.action);

        menu.appendChild(menuItem);
    }

    addContextMenuItem(item) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        const menuItem = document.createElement('div');
        menuItem.className = 'context-item';
        menuItem.innerHTML = `<span>${item.label}</span>`;
        menuItem.addEventListener('click', () => {
            item.action(window.contextMenuTarget);
            menu.classList.remove('visible');
        });

        menu.appendChild(menuItem);
    }

    addSidebarPanel(id, title, contentHtml) {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        const panel = document.createElement('div');
        panel.id = `ext-panel-${id}`;
        panel.className = 'ext-sidebar-panel';
        panel.innerHTML = `
            <div class="ext-panel-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span>${title}</span>
                <span class="ext-panel-arrow">▼</span>
            </div>
            <div class="ext-panel-content">${contentHtml}</div>
        `;

        sidebar.appendChild(panel);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtensionManager;
}
