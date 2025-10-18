const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let updateInfo = null;
let autoUpdater = null;

// 動態導入 electron-serve，避免在開發環境中的問題
let serve = null;
let appServe = null;

if (app.isPackaged) {
  try {
    serve = require('electron-serve');
    appServe = serve({ directory: path.join(__dirname, '../out') });
  } catch (error) {
    console.error('Failed to load electron-serve:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 840,
    height: 630,
    resizable: false,
    maximizable: false,
    title: 'EQ RTS MAP - ExpTech Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: true,
      enableRemoteModule: true,
      backgroundThrottling: false,
    },
    show: false,
  });

  require('@electron/remote/main').initialize();
  require('@electron/remote/main').enable(mainWindow.webContents);

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    if (appServe) {
      appServe(mainWindow).then(() => {
        mainWindow.loadURL('app://-');
      }).catch(err => {
        console.error('Failed to load with electron-serve:', err);
        // 備用方案：直接載入文件
        mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
      });
    } else {
      console.error('appServe not available, using fallback');
      // 備用方案：直接載入文件
      mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    }
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('Console:', message);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIPCHandlers() {
  ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) {
      return { success: false, error: 'AutoUpdater not available in development mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      console.error('Check for updates error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (!autoUpdater) {
      return { success: false, error: 'AutoUpdater not available in development mode' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Download update error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-update', () => {
    if (!autoUpdater) {
      return { success: false, error: 'AutoUpdater not available in development mode' };
    }
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-audio-path', (event, audioFile) => {
    const audioPath = path.join(__dirname, '../resources/audios', audioFile);
    return audioPath;
  });
}

function initAutoUpdater() {
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping autoUpdater in development mode');
    return;
  }

  const { autoUpdater: updater } = require('electron-updater');
  autoUpdater = updater;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    if (mainWindow) {
      mainWindow.webContents.send('update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    updateInfo = info;
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err.message);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
  });

  registerIPCHandlers();
  createWindow();
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
