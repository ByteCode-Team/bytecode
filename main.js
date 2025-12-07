const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Désactiver le GPU pour éviter les problèmes de rendu
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Settings functions
function loadSettings() {
  try {
    if (fsSync.existsSync(settingsPath)) {
      const data = fsSync.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return null;
}

function saveSettingsToFile(settings) {
  try {
    fsSync.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      nodeIntegrationInWorker: false,
      webviewTag: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'ByteCode'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-file')
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            dialog.showOpenDialog(mainWindow, { properties: ['openFile'] }).then(result => {
              if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                fs.readFile(filePath, 'utf8').then(data => {
                  mainWindow.webContents.send('file-opened', {
                    path: filePath,
                    content: data,
                    name: path.basename(filePath)
                  });
                });
              }
            });
          }
        },
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }).then(async result => {
              if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                try {
                  const structure = await readDirectory(folderPath);
                  mainWindow.webContents.send('folder-opened', {
                    path: folderPath,
                    name: path.basename(folderPath),
                    structure: structure
                  });
                } catch (err) {
                  dialog.showErrorBox('Error', 'Cannot read folder');
                }
              }
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-file')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('save-file-as')
        },
        { type: 'separator' },
        {
          label: 'Close Folder',
          click: () => mainWindow.webContents.send('close-folder')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('find')
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('replace')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Toggle Terminal',
          accelerator: 'Ctrl+`',
          click: () => mainWindow.webContents.send('toggle-terminal')
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About ByteCode',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About ByteCode',
              message: 'ByteCode IDE',
              detail: 'Version 0.0.1\nByteCode, a modern IDE powered by Monaco Editor by the ByteCode-Team. Thanks to Lololegeek, the founder of ByteCode-Team and ByteCode.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.on('open-file-dialog', () => {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'JavaScript', extensions: ['js', 'jsx'] },
      { name: 'TypeScript', extensions: ['ts', 'tsx'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'CSS', extensions: ['css', 'scss', 'sass'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Python', extensions: ['py'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      fs.readFile(filePath, 'utf8').then(data => {
        mainWindow.webContents.send('file-opened', {
          path: filePath,
          content: data,
          name: path.basename(filePath)
        });
      }).catch(err => {
        dialog.showErrorBox('Error', 'Cannot read file');
      });
    }
  });
});

ipcMain.on('open-folder-dialog', () => {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  }).then(async result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      try {
        const structure = await readDirectory(folderPath);
        mainWindow.webContents.send('folder-opened', {
          path: folderPath,
          name: path.basename(folderPath),
          structure: structure
        });
      } catch (err) {
        dialog.showErrorBox('Error', 'Cannot read folder');
      }
    }
  });
});

async function readDirectory(dirPath) {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const result = [];

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);

    // Skip hidden files and node_modules
    if (item.name.startsWith('.') || item.name === 'node_modules') {
      continue;
    }

    if (item.isDirectory()) {
      result.push({
        name: item.name,
        path: fullPath,
        type: 'folder',
        children: []
      });
    } else {
      result.push({
        name: item.name,
        path: fullPath,
        type: 'file'
      });
    }
  }

  return result.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });
}

ipcMain.on('load-folder-contents', async (event, folderPath) => {
  try {
    const structure = await readDirectory(folderPath);
    event.reply('folder-contents-loaded', {
      path: folderPath,
      structure: structure
    });
  } catch (err) {
    event.reply('folder-contents-error', { path: folderPath });
  }
});

// Refresh a folder (reload its contents)
ipcMain.on('refresh-folder', async (event, folderPath) => {
  try {
    const structure = await readDirectory(folderPath);
    event.reply('folder-refreshed', {
      path: folderPath,
      name: path.basename(folderPath),
      structure: structure
    });
  } catch (err) {
    event.reply('folder-refresh-error', { path: folderPath });
  }
});

ipcMain.on('read-file', (event, filePath) => {
  fsSync.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      event.reply('file-read-error', { path: filePath });
    } else {
      event.reply('file-read-success', {
        path: filePath,
        content: data,
        name: path.basename(filePath)
      });
    }
  });
});

ipcMain.on('save-file-content', (event, { filePath, content }) => {
  if (filePath) {
    fsSync.writeFile(filePath, content, 'utf8', (err) => {
      if (err) {
        dialog.showErrorBox('Error', 'Cannot save file');
        event.reply('save-file-result', { success: false });
      } else {
        event.reply('save-file-result', { success: true, path: filePath });
      }
    });
  } else {
    dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    }).then(result => {
      if (!result.canceled) {
        fsSync.writeFile(result.filePath, content, 'utf8', (err) => {
          if (err) {
            dialog.showErrorBox('Error', 'Cannot save file');
            event.reply('save-file-result', { success: false });
          } else {
            event.reply('save-file-result', { success: true, path: result.filePath });
          }
        });
      }
    });
  }
});

// Créer un nouveau fichier
ipcMain.on('create-file', async (event, { folderPath, fileName }) => {
  try {
    const filePath = path.join(folderPath, fileName);
    await fs.writeFile(filePath, '', 'utf8');
    event.reply('file-created', { success: true, path: filePath });
  } catch (err) {
    event.reply('file-created', { success: false, error: err.message });
  }
});

// Créer un nouveau dossier
ipcMain.on('create-folder', async (event, { parentPath, folderName }) => {
  try {
    const folderPath = path.join(parentPath, folderName);
    await fs.mkdir(folderPath);
    event.reply('folder-created', { success: true, path: folderPath });
  } catch (err) {
    event.reply('folder-created', { success: false, error: err.message });
  }
});

// Supprimer un fichier
ipcMain.on('delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    event.reply('file-deleted', { success: true, path: filePath });
  } catch (err) {
    event.reply('file-deleted', { success: false, error: err.message });
  }
});

// Supprimer un dossier
ipcMain.on('delete-folder', async (event, folderPath) => {
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    event.reply('folder-deleted', { success: true, path: folderPath });
  } catch (err) {
    event.reply('folder-deleted', { success: false, error: err.message });
  }
});

// Renommer un fichier ou dossier
ipcMain.on('rename-item', async (event, { oldPath, newPath }) => {
  try {
    await fs.rename(oldPath, newPath);
    event.reply('item-renamed', { success: true, oldPath, newPath });
  } catch (err) {
    event.reply('item-renamed', { success: false, error: err.message });
  }
});

// Copier un fichier ou dossier
ipcMain.on('copy-item', async (event, { sourcePath, destPath }) => {
  try {
    const stats = await fs.stat(sourcePath);
    if (stats.isDirectory()) {
      await fs.cp(sourcePath, destPath, { recursive: true });
    } else {
      await fs.copyFile(sourcePath, destPath);
    }
    event.reply('item-copied', { success: true, sourcePath, destPath });
  } catch (err) {
    event.reply('item-copied', { success: false, error: err.message });
  }
});

// Déplacer un fichier ou dossier
ipcMain.on('move-item', async (event, { sourcePath, destPath }) => {
  try {
    await fs.rename(sourcePath, destPath);
    event.reply('item-moved', { success: true, sourcePath, destPath });
  } catch (err) {
    event.reply('item-moved', { success: false, error: err.message });
  }
});

// Settings management
ipcMain.on('load-settings', (event) => {
  const settings = loadSettings();
  event.reply('settings-loaded', settings);
});

ipcMain.on('save-settings', (event, settings) => {
  saveSettingsToFile(settings);
});

ipcMain.on('restart-app', () => {
  app.relaunch();
  app.exit();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('show-about', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About ByteCode',
    message: 'ByteCode IDE',
    detail: 'Version 0.0.1\nByteCode, a modern IDE powered by Monaco Editor by the ByteCode-Team. Thanks to Lololegeek, the founder of ByteCode-Team and ByteCode.',
    buttons: ['OK']
  });
});

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.on('execute-terminal-command', (event, { command, cwd }) => {
  const { exec } = require('child_process');
  
  exec(command, { cwd: cwd, shell: true }, (error, stdout, stderr) => {
    event.reply('terminal-command-result', {
      error: error ? error.message : null,
      stdout: stdout,
      stderr: stderr
    });
  });
});