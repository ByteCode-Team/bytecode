// Context Menu Manager
let contextMenuTarget = null;
let contextMenuTargetPath = null;
let contextMenuTargetType = null;
let inputModalCallback = null;

const contextMenu = document.getElementById('context-menu');

// Hide context menu on click outside
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Hide on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideContextMenu();
        closeInputModal();
    }
});

function showContextMenu(e, path, type) {
    e.preventDefault();
    e.stopPropagation();

    contextMenuTarget = e.target.closest('.tree-item');
    contextMenuTargetPath = path;
    contextMenuTargetType = type;

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.add('visible');

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
}

function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

// Context menu actions
function contextNewFile() {
    hideContextMenu();
    const parentPath = contextMenuTargetType === 'folder' ? contextMenuTargetPath :
        require('path').dirname(contextMenuTargetPath);

    showInputModal('New File', 'Enter file name...', (name) => {
        if (name) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('create-file', { folderPath: parentPath, fileName: name });
        }
    });
}

function contextNewFolder() {
    hideContextMenu();
    const parentPath = contextMenuTargetType === 'folder' ? contextMenuTargetPath :
        require('path').dirname(contextMenuTargetPath);

    showInputModal('New Folder', 'Enter folder name...', (name) => {
        if (name) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('create-folder', { parentPath: parentPath, folderName: name });
        }
    });
}

function contextRename() {
    hideContextMenu();
    const oldName = require('path').basename(contextMenuTargetPath);

    showInputModal('Rename', 'Enter new name...', (newName) => {
        if (newName && newName !== oldName) {
            const { ipcRenderer } = require('electron');
            const newPath = require('path').join(require('path').dirname(contextMenuTargetPath), newName);
            ipcRenderer.send('rename-item', { oldPath: contextMenuTargetPath, newPath: newPath });
        }
    }, oldName);
}

function contextDelete() {
    hideContextMenu();
    const name = require('path').basename(contextMenuTargetPath);

    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        const { ipcRenderer } = require('electron');
        if (contextMenuTargetType === 'folder') {
            ipcRenderer.send('delete-folder', contextMenuTargetPath);
        } else {
            ipcRenderer.send('delete-file', contextMenuTargetPath);
        }
    }
}

function contextCopyPath() {
    hideContextMenu();
    const { clipboard } = require('electron');
    clipboard.writeText(contextMenuTargetPath);
}

// Input Modal
function showInputModal(title, placeholder, callback, defaultValue = '') {
    const modal = document.getElementById('input-modal');
    const titleEl = document.getElementById('input-modal-title');
    const input = document.getElementById('input-modal-input');

    // Reset user-select just in case it got stuck from resizing
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // We can't easily access the valid local isResizing here if it's defined later,
    // but we can query the DOM state which is the source of truth
    const resizer = document.getElementById('sidebar-resizer');
    if (resizer && resizer.classList.contains('resizing')) {
        resizer.classList.remove('resizing');
        // If we could access isResizing, we would set it to false
    }

    titleEl.textContent = title;
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.disabled = false;
    input.readOnly = false;
    inputModalCallback = callback;

    modal.style.display = 'flex';
    modal.style.zIndex = '10000'; // Ensure it is on top of everything

    // Prevent click propagation on the input to ensure focus stays
    input.onclick = (e) => {
        e.stopPropagation();
        input.focus();
    };

    // Use setTimeout to ensure the modal is fully visible before focusing
    setTimeout(() => {
        input.focus();
        if (defaultValue) {
            input.select();
        }
    }, 100);
}

function closeInputModal() {
    const modal = document.getElementById('input-modal');
    const input = document.getElementById('input-modal-input');

    modal.style.display = 'none';
    input.value = '';
    input.blur();
    inputModalCallback = null;
}

function confirmInputModal() {
    const input = document.getElementById('input-modal-input');
    const value = input.value.trim();
    const callback = inputModalCallback;

    closeInputModal();

    // Call the callback after closing to avoid any state issues
    if (callback && value) {
        callback(value);
    }
}

function handleInputModalKey(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmInputModal();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeInputModal();
    }
}

// New File/Folder from sidebar buttons
function showNewFileDialog() {
    if (!window.currentFolder) {
        alert('Please open a folder first');
        return;
    }
    showInputModal('New File', 'Enter file name...', (name) => {
        if (name) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('create-file', { folderPath: window.currentFolder.path, fileName: name });
        }
    });
}

function showNewFolderDialog() {
    if (!window.currentFolder) {
        alert('Please open a folder first');
        return;
    }
    showInputModal('New Folder', 'Enter folder name...', (name) => {
        if (name) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('create-folder', { parentPath: window.currentFolder.path, folderName: name });
        }
    });
}

function refreshFolder() {
    if (window.currentFolder) {
        refreshCurrentFolder();
    }
}

// Sidebar Resizer
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth >= 150 && newWidth <= 500) {
        sidebar.style.width = `${newWidth}px`;
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Trigger editor layout update
        if (window.editor) {
            window.editor.layout();
        }
    }
});

// IPC listeners for file operations
// Note: ipcRenderer is already defined in renderer.js, we get it from there
const ipcRendererCtx = require('electron').ipcRenderer;

ipcRendererCtx.on('file-created', (event, result) => {
    if (result.success) {
        refreshCurrentFolder();
    } else {
        alert('Failed to create file: ' + result.error);
    }
});

ipcRendererCtx.on('folder-created', (event, result) => {
    if (result.success) {
        refreshCurrentFolder();
    } else {
        alert('Failed to create folder: ' + result.error);
    }
});

ipcRendererCtx.on('file-deleted', (event, result) => {
    if (result.success) {
        refreshCurrentFolder();
        // Close the file if it was open
        if (window.openFiles) {
            const index = window.openFiles.findIndex(f => f.path === result.path);
            if (index >= 0) {
                window.closeFile(index);
            }
        }
    } else {
        alert('Failed to delete file: ' + result.error);
    }
});

ipcRendererCtx.on('folder-deleted', (event, result) => {
    if (result.success) {
        refreshCurrentFolder();
    } else {
        alert('Failed to delete folder: ' + result.error);
    }
});

ipcRendererCtx.on('item-renamed', (event, result) => {
    if (result.success) {
        refreshCurrentFolder();
        // Update open file if renamed
        if (window.openFiles) {
            const index = window.openFiles.findIndex(f => f.path === result.oldPath);
            if (index >= 0) {
                window.openFiles[index].path = result.newPath;
                window.openFiles[index].name = require('path').basename(result.newPath);
                if (window.updateEditorTabs) window.updateEditorTabs();
                if (window.updateTitleBar) window.updateTitleBar();
            }
        }
    } else {
        alert('Failed to rename: ' + result.error);
    }
});

function refreshCurrentFolder() {
    if (window.currentFolder) {
        ipcRendererCtx.send('refresh-folder', window.currentFolder.path);
    }
}

// Listen for folder refresh
ipcRendererCtx.on('folder-refreshed', (event, data) => {
    if (window.currentFolder && data.path === window.currentFolder.path) {
        window.currentFolder = data;

        const container = document.getElementById('folder-tree');
        if (container && window.renderFolderTree) {
            const safeName = data.name || require('path').basename(data.path) || 'Project';
            container.innerHTML = `<div class="folder-name">${safeName}</div>`;
            window.renderFolderTree(data.structure, container, 0);
        }
    }
});

// Expose functions
window.showContextMenu = showContextMenu;
window.hideContextMenu = hideContextMenu;
window.showNewFileDialog = showNewFileDialog;
window.showNewFolderDialog = showNewFolderDialog;
window.refreshFolder = refreshFolder;
window.contextNewFile = contextNewFile;
window.contextNewFolder = contextNewFolder;
window.contextRename = contextRename;
window.contextDelete = contextDelete;
window.contextCopyPath = contextCopyPath;
window.showInputModal = showInputModal;
window.closeInputModal = closeInputModal;
window.confirmInputModal = confirmInputModal;
window.handleInputModalKey = handleInputModalKey;