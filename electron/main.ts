import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import serve from 'electron-serve';
import path from 'path';

const isProd = app.isPackaged;
const loadURL = serve({
  directory: 'out',
  scheme: 'app'
});

// Get the correct preload path based on environment
// With webpack's __dirname: false, __dirname will be the actual runtime directory
const getPreloadPath = () => {
  // In both dev and prod, after webpack compiles:
  // main.cjs is in build/, preload.cjs is also in build/
  // __dirname will point to the build directory
  return path.join(__dirname, 'preload.cjs');
};

let mainWindow: BrowserWindow | null;

// Auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Log auto-updater events for debugging
autoUpdater.on('checking-for-update', () => {
  console.log('🔍 Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('✅ Update available:', info.version);
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

autoUpdater.on('update-not-available', (info) => {
  console.log('✅ Update not available. Current version:', info.version);
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`📥 Download progress: ${progressObj.percent.toFixed(2)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Update downloaded:', info.version);
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
  console.error('❌ Update error:', err.message);
  console.error('Error stack:', err.stack);
});

(async () => {
  await app.whenReady();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  if (isProd) {
    // Production: load from out directory, directly to /home
    await loadURL(mainWindow);
    // Navigate to /home after loading
    await mainWindow.loadURL('app://-/home.html');
  } else {
    // Development: load from Next.js dev server
    await mainWindow.loadURL('http://localhost:3000/home');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  }

  // Check for updates after app is ready (only in production)
  if (app.isPackaged) {
    console.log('📦 App version:', app.getVersion());
    console.log('🔄 Auto-update enabled. Feed URL:', autoUpdater.getFeedURL());

    // Initial check
    autoUpdater.checkForUpdates().catch(err => {
      console.error('❌ Failed to check for updates:', err);
    });

    // Check for updates every 300 seconds (5 minutes)
    setInterval(() => {
      console.log('⏰ Scheduled update check...');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('❌ Failed to check for updates:', err);
      });
    }, 300000);
  } else {
    console.log('🚫 Auto-update disabled in development mode');
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
        preload: getPreloadPath(),
      },
    });

    if (isProd) {
      await loadURL(mainWindow);
      await mainWindow.loadURL('app://-/home.html');
    } else {
      await mainWindow.loadURL('http://localhost:3000/home');
    }
  }
});
