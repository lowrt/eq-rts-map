const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const serve = require('electron-serve');

let mainWindow;
let updateInfo = null;
let autoUpdater = null;

const appServe = app.isPackaged
  ? serve({ directory: path.join(__dirname, '../out') })
  : null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 840,
    height: 630,
    resizable: false,
    maximizable: false,
    title: 'EQ RTS MAP - ExpTech Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      enableRemoteModule: true,
      backgroundThrottling: false,
    },
  });

  require('@electron/remote/main').initialize();
  require('@electron/remote/main').enable(mainWindow.webContents);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    if (appServe) {
      appServe(mainWindow).then(() => {
        mainWindow.loadURL('app://-');
      }).catch(err => {
        console.error('Failed to load with electron-serve:', err);
      });
    } else {
      console.error('appServe not available');
    }
  }

  // 監聽頁面載入完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // 監聽頁面載入失敗
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  // 監聽控制台訊息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('Console:', message);
  });

  // 處理外部連結
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 註冊 IPC 處理器
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

// 初始化 autoUpdater（只在生產環境）
function initAutoUpdater() {
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping autoUpdater in development mode');
    return;
  }

  const { autoUpdater: updater } = require('electron-updater');
  autoUpdater = updater;

  // 配置 autoUpdater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 設置事件監聽器
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

  // 延遲 3 秒後檢查更新
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  // 每 4 小時檢查一次更新
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

// App 生命週期
app.whenReady().then(() => {
  // 設置開機自啟動
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

// 處理第二個實例
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
