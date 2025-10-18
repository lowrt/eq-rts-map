import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import serve from 'electron-serve';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadURL = serve({ directory: 'out' });

let mainWindow: BrowserWindow | null;

// Auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '發現新版本',
      message: `發現新版本 ${info.version}`,
      detail: '正在下載更新...',
      buttons: ['確定']
    });
  }
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下載',
      message: `新版本 ${info.version} 已下載完成`,
      detail: '是否立即重啟應用以安裝更新？',
      buttons: ['立即重啟', '稍後'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});

(async () => {
  await app.whenReady();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  await loadURL(mainWindow);

  // Check for updates after app is ready (only in production)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();

    // Check for updates every 300 seconds (5 minutes)
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 300000);
  }
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });

    await loadURL(mainWindow);
  }
});
