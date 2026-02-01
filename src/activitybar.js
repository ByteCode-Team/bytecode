(() => {
    // ==========================================
    // ACTIVITY BAR & EXTENSIONS MARKETPLACE UI
    // ==========================================
    // This module provides the Activity Bar UI (Explorer/Extensions toggle)
    // and the Marketplace sidebar that displays available/installed extensions.
    // It uses the existing ExtensionManager (src/extensions.js) for the real work.

    const fs = require('fs');
    const path = require('path');

    // Disabled extensions are stored in localStorage
    const DISABLED_KEY = 'bytecode-disabled-extensions';

    function getDisabledExtensions() {
        try {
            return JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function setDisabledExtensions(list) {
        localStorage.setItem(DISABLED_KEY, JSON.stringify(list));
    }

    function isExtensionDisabled(id) {
        return getDisabledExtensions().includes(id);
    }

    // Get the extensions folder path (same logic as ExtensionManager)
    function getExtensionsDir() {
        return path.join(process.cwd(), 'extensions');
    }

    window.currentActivity = 'explorer';

    // Switch between Explorer and Extensions sidebar
    window.switchActivity = function (activityId) {
        const explorerSidebar = document.getElementById('sidebar');
        const extensionsSidebar = document.getElementById('sidebar-extensions');
        const explorerBtn = document.getElementById('activity-explorer');
        const extensionsBtn = document.getElementById('activity-extensions');

        // Deactivate all
        if (explorerSidebar) explorerSidebar.style.display = 'none';
        if (extensionsSidebar) extensionsSidebar.style.display = 'none';
        if (explorerBtn) explorerBtn.classList.remove('active');
        if (extensionsBtn) extensionsBtn.classList.remove('active');

        if (activityId === 'explorer') {
            if (explorerSidebar) explorerSidebar.style.display = 'flex';
            if (explorerBtn) explorerBtn.classList.add('active');
            window.currentActivity = 'explorer';
        } else if (activityId === 'extensions') {
            if (extensionsSidebar) extensionsSidebar.style.display = 'flex';
            if (extensionsBtn) extensionsBtn.classList.add('active');
            window.currentActivity = 'extensions';
            window.renderExtensions();
        }
    };

    // Read extensions from the extensions folder (looking for manifest.json in each subfolder)
    function getAvailableExtensions() {
        const extDir = getExtensionsDir();
        const extensions = [];

        if (!fs.existsSync(extDir)) {
            return extensions;
        }

        try {
            const entries = fs.readdirSync(extDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const manifestPath = path.join(extDir, entry.name, 'manifest.json');
                    if (fs.existsSync(manifestPath)) {
                        try {
                            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                            extensions.push({
                                id: manifest.id || entry.name,
                                name: manifest.name || entry.name,
                                version: manifest.version || '1.0.0',
                                description: manifest.description || '',
                                author: manifest.author || 'Unknown',
                                path: path.join(extDir, entry.name)
                            });
                        } catch (e) {
                            console.warn('Failed to read manifest for', entry.name, e);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to read extensions folder:', e);
        }

        return extensions;
    }

    // Check if extension is loaded (via ExtensionManager)
    function isExtensionLoaded(id) {
        if (window.extensionManager && window.extensionManager.extensions) {
            return window.extensionManager.extensions.has(id);
        }
        return false;
    }

    // Extension icons based on ID
    function getExtensionIcon(id) {
        const icons = {
            'live-server': '📡',
            'prettier-format': '💅',
            'git-lens': '🔍',
            'vscode-icons': '📁',
            'word-counter': '🔢'
        };
        return icons[id] || '📦';
    }

    // Render Extensions List in the Marketplace sidebar
    window.renderExtensions = function () {
        const list = document.getElementById('extension-list');
        if (!list) return;

        const search = document.getElementById('extensions-search');
        const query = search ? search.value.toLowerCase() : '';

        list.innerHTML = '';

        const extensions = getAvailableExtensions();
        const filtered = extensions.filter(ext =>
            ext.name.toLowerCase().includes(query) ||
            ext.description.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: #858585;">No extensions found in extensions/ folder.</div>';
            return;
        }

        filtered.forEach(ext => {
            const item = document.createElement('div');
            item.className = 'extension-item';

            const isLoaded = isExtensionLoaded(ext.id);
            const isDisabled = isExtensionDisabled(ext.id);
            const icon = getExtensionIcon(ext.id);

            let actionButton = '';
            if (isDisabled) {
                actionButton = `<button class="extension-btn" onclick="enableExtension('${ext.id}')">Enable</button>`;
            } else if (isLoaded) {
                actionButton = `<button class="extension-btn secondary" onclick="disableExtension('${ext.id}')">Disable</button>`;
            } else {
                actionButton = `<button class="extension-btn" onclick="loadExtensionManually('${ext.id}')">Load</button>`;
            }

            const statusBadge = isDisabled
                ? '<span style="color:#f48771;font-size:10px;margin-left:5px;">● Disabled</span>'
                : (isLoaded ? '<span style="color:#89d185;font-size:10px;margin-left:5px;">● Active</span>' : '');

            item.innerHTML = `
                <div class="extension-icon">${icon}</div>
                <div class="extension-details">
                    <div class="extension-header">
                        <span class="extension-name">${ext.name}</span>
                        <span class="extension-version">${ext.version}</span>
                        ${statusBadge}
                    </div>
                    <span class="extension-author">${ext.author}</span>
                    <span class="extension-desc">${ext.description}</span>
                    <div class="extension-actions">
                        ${actionButton}
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    };

    window.filterExtensions = function (val) {
        window.renderExtensions();
    };

    // Manually load/reload an extension (using ExtensionManager)
    window.loadExtensionManually = async function (id) {
        if (!window.extensionManager) {
            console.error('ExtensionManager not available');
            return;
        }

        const extDir = getExtensionsDir();
        const extPath = path.join(extDir, id);

        if (!fs.existsSync(extPath)) {
            alert(`Extension folder not found: ${extPath}`);
            return;
        }

        // Remove from disabled list if it was there
        let disabled = getDisabledExtensions();
        disabled = disabled.filter(d => d !== id);
        setDisabledExtensions(disabled);

        try {
            await window.extensionManager.loadExtension(extPath);
            window.renderExtensions();
        } catch (e) {
            console.error('Failed to load extension:', id, e);
            alert('Failed to load extension: ' + e.message);
        }
    };

    // Disable an extension (marks it as disabled, requires restart to take effect)
    window.disableExtension = function (id) {
        let disabled = getDisabledExtensions();
        if (!disabled.includes(id)) {
            disabled.push(id);
            setDisabledExtensions(disabled);
        }

        // Note: To fully "unload" an extension at runtime is complex (need to undo all its hooks, status bar items, etc.)
        // For simplicity, we mark it disabled and it won't load on next restart
        alert(`Extension "${id}" has been disabled. Restart the app for changes to take effect.`);
        window.renderExtensions();
    };

    // Enable an extension
    window.enableExtension = function (id) {
        let disabled = getDisabledExtensions();
        disabled = disabled.filter(d => d !== id);
        setDisabledExtensions(disabled);

        // Try to load it now
        window.loadExtensionManually(id);
    };

    console.log('Activity Bar module loaded.');
})();
