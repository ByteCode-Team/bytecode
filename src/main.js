const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Enable @electron/remote for AI features
require('@electron/remote/main').initialize();

// Désactiver le GPU pour éviter les problèmes de rendu
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

let translations = {};
let currentLang = 'en';

// Load translations
function loadTranslations() {
  try {
    const translationsPath = path.join(__dirname, '../translations.json');
    const data = fsSync.readFileSync(translationsPath, 'utf8');
    translations = JSON.parse(data);
    const settings = loadSettings();
    currentLang = settings?.language || 'en';
  } catch (err) {
    console.error('Failed to load translations in main process:', err);
    translations = { en: {} };
  }
}

function t(key) {
  return translations[currentLang]?.[key] || translations['en']?.[key] || key;
}

loadTranslations();

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
    icon: path.join(__dirname, '../assets', 'icon.png'),
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'ByteCode'
  });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Open external links (including Puter subscription/auth popups) in the user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      shell.openExternal(url);
    } catch (e) {
      console.error('Failed to open external URL:', url, e);
    }
    return { action: 'deny' };
  });

  // Enable @electron/remote for this window
  require('@electron/remote/main').enable(mainWindow.webContents);

  // Intercept Puter.js requests to fake Origin
  // This fixes the 403 Forbidden error because Puter rejects 'file://' origin
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.puter.com/*', '*://*.puter.site/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'http://localhost';
      details.requestHeaders['Referer'] = 'http://localhost/';
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Custom window controls (frameless window)
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize-toggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on('window-close', () => {
  app.quit();
});

function createMenu() {
  const template = [
    {
      label: t('file'),
      submenu: [
        {
          label: t('newFile'),
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-file')
        },
        {
          label: t('openFile'),
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
          label: t('openFolder'),
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
                  dialog.showErrorBox(t('error'), t('cannotReadFolder'));
                }
              }
            });
          }
        },
        { type: 'separator' },
        {
          label: t('save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-file')
        },
        {
          label: t('saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('save-file-as')
        },
        { type: 'separator' },
        {
          label: t('closeFolder'),
          click: () => mainWindow.webContents.send('close-folder')
        },
        { type: 'separator' },
        {
          label: t('exit'),
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: t('edit'),
      submenu: [
        { label: t('undo'), accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: t('redo'), accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: t('cut'), accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: t('copy'), accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: t('paste'), accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        {
          label: t('find'),
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('find')
        },
        {
          label: t('replace'),
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('replace')
        }
      ]
    },
    {
      label: t('view'),
      submenu: [
        { label: t('reload'), accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: t('toggleDevTools'), accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: t('toggleTerminal'),
          accelerator: 'Ctrl+`',
          click: () => mainWindow.webContents.send('toggle-terminal')
        },
        { type: 'separator' },
        { label: t('zoomIn'), accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: t('zoomOut'), accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: t('resetZoom'), accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: t('toggleFullScreen'), accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: t('help'),
      submenu: [
        {
          label: t('about'),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: t('aboutByteCode'),
              message: t('ByteCodeIDE'),
              detail: t('aboutDetail'),
              buttons: [t('ok')]
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
      { name: t('allFiles'), extensions: ['*'] },
      { name: t('javaScript'), extensions: ['js', 'jsx'] },
      { name: t('typeScript'), extensions: ['ts', 'tsx'] },
      { name: t('html'), extensions: ['html', 'htm'] },
      { name: t('css'), extensions: ['css', 'scss', 'sass'] },
      { name: t('json'), extensions: ['json'] },
      { name: t('markdown'), extensions: ['md'] },
      { name: t('python'), extensions: ['py'] }
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
        dialog.showErrorBox(t('error'), t('cannotReadFile'));
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
        dialog.showErrorBox(t('error'), t('cannotSaveFile'));
        event.reply('save-file-result', { success: false });
      } else {
        event.reply('save-file-result', { success: true, path: filePath });
      }
    });
  } else {
    dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: t('allFiles'), extensions: ['*'] }
      ]
    }).then(result => {
      if (!result.canceled) {
        fsSync.writeFile(result.filePath, content, 'utf8', (err) => {
          if (err) {
            dialog.showErrorBox(t('error'), t('cannotSaveFile'));
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
  // Update the current language in the main process immediately
  currentLang = settings.language || 'en';
  // Rebuild the menu with the new language
  createMenu();
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
    title: t('aboutByteCode'),
    message: t('ByteCodeIDE'),
    detail: t('aboutDetail'),
    buttons: [t('ok')]
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