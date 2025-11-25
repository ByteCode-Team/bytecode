// Gestion des menus contextuels pour les fichiers et dossiers
class ContextMenu {
    constructor() {
        this.menu = null;
        this.currentPath = null;
        this.currentType = null;
        this.init();
    }

    init() {
        // Créer le menu contextuel
        this.menu = document.createElement('div');
        this.menu.className = 'context-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);

        // Fermer le menu en cliquant ailleurs
        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => {
            // Empêcher le menu par défaut sauf sur le menu contextuel
            if (!e.target.closest('.context-menu')) {
                e.preventDefault();
            }
        });
    }

    show(x, y, path, type, parentPath) {
        this.currentPath = path;
        this.currentType = type;
        this.currentParentPath = parentPath;

        // Construire le menu en fonction du type
        const items = this.getMenuItems(type);
        this.menu.innerHTML = items.map(item => {
            if (item.separator) {
                return '<div class="context-menu-separator"></div>';
            }
            return `
                <div class="context-menu-item" data-action="${item.action}">
                    <span class="context-menu-icon">${item.icon}</span>
                    <span class="context-menu-label">${item.label}</span>
                </div>
            `;
        }).join('');

        // Positionner le menu
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.style.display = 'block';

        // Ajouter les event listeners
        this.menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleAction(action);
                this.hide();
            });
        });
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
    }

    getMenuItems(type) {
        const baseItems = [
            { icon: '✏️', label: 'Rename', action: 'rename' },
            { icon: '📋', label: 'Copy', action: 'copy' },
            { icon: '✂️', label: 'Cut', action: 'cut' },
            { separator: true },
            { icon: '🗑️', label: 'Delete', action: 'delete' }
        ];

        if (type === 'folder') {
            return [
                { icon: '📄', label: 'New File', action: 'new-file' },
                { icon: '📁', label: 'New Folder', action: 'new-folder' },
                { separator: true },
                ...baseItems
            ];
        }

        return baseItems;
    }

    async handleAction(action) {
        switch (action) {
            case 'new-file':
                await this.createNewFile();
                break;
            case 'new-folder':
                await this.createNewFolder();
                break;
            case 'rename':
                await this.renameItem();
                break;
            case 'delete':
                await this.deleteItem();
                break;
            case 'copy':
                this.copyItem();
                break;
            case 'cut':
                this.cutItem();
                break;
        }
    }

    async createNewFile() {
        const fileName = prompt('Enter file name:');
        if (!fileName) return;

        const pathModule = require('path');
        const folderPath = this.currentType === 'folder' ? this.currentPath : this.currentParentPath;

        ipcRenderer.send('create-file', {
            folderPath: folderPath,
            fileName: fileName
        });
    }

    async createNewFolder() {
        const folderName = prompt('Enter folder name:');
        if (!folderName) return;

        const pathModule = require('path');
        const parentPath = this.currentType === 'folder' ? this.currentPath : this.currentParentPath;

        ipcRenderer.send('create-folder', {
            parentPath: parentPath,
            folderName: folderName
        });
    }

    async renameItem() {
        const pathModule = require('path');
        const oldName = pathModule.basename(this.currentPath);
        const newName = prompt('Enter new name:', oldName);

        if (!newName || newName === oldName) return;

        const newPath = pathModule.join(pathModule.dirname(this.currentPath), newName);

        ipcRenderer.send('rename-item', {
            oldPath: this.currentPath,
            newPath: newPath
        });
    }

    async deleteItem() {
        const pathModule = require('path');
        const itemName = pathModule.basename(this.currentPath);
        const confirmMsg = `Are you sure you want to delete "${itemName}"?`;

        if (!confirm(confirmMsg)) return;

        if (this.currentType === 'folder') {
            ipcRenderer.send('delete-folder', this.currentPath);
        } else {
            ipcRenderer.send('delete-file', this.currentPath);
        }
    }

    copyItem() {
        // Stocker dans le presse-papier interne
        window.clipboard = {
            path: this.currentPath,
            type: this.currentType,
            operation: 'copy'
        };
        console.log('Copied:', this.currentPath);
    }

    cutItem() {
        // Stocker dans le presse-papier interne
        window.clipboard = {
            path: this.currentPath,
            type: this.currentType,
            operation: 'cut'
        };
        console.log('Cut:', this.currentPath);
    }
}

// Fonction pour coller un élément
function pasteItem(targetPath) {
    if (!window.clipboard) {
        alert('Nothing to paste');
        return;
    }

    const pathModule = require('path');
    const itemName = pathModule.basename(window.clipboard.path);
    const destPath = pathModule.join(targetPath, itemName);

    if (window.clipboard.operation === 'copy') {
        ipcRenderer.send('copy-item', {
            sourcePath: window.clipboard.path,
            destPath: destPath
        });
    } else if (window.clipboard.operation === 'cut') {
        ipcRenderer.send('move-item', {
            sourcePath: window.clipboard.path,
            destPath: destPath
        });
        window.clipboard = null;
    }
}

// Export pour utilisation
window.ContextMenu = ContextMenu;
window.pasteItem = pasteItem;
