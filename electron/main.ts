import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
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
autoUpdater.autoDownload = true;  // 自動下載更新
autoUpdater.autoInstallOnAppQuit = true;  // 退出時自動安裝

// Configure GitHub provider with no 'v' prefix
if (app.isPackaged) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'ExpTechTW',
    repo: 'eq-rts-map',
    vPrefixedTagName: false,
  });
}

// Log auto-updater events for debugging
autoUpdater.on('checking-for-update', () => {
  console.log('🔍 Checking for updates...');
  if (mainWindow) {
    mainWindow.webContents.send('update-checking');
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('✅ Update available:', info.version);
  console.log('📥 Downloading update silently...');
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
  // 靜默下載，不顯示彈窗
});

autoUpdater.on('update-not-available', (info) => {
  console.log('✅ Update not available. Current version:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`📥 Download progress: ${progressObj.percent.toFixed(2)}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Update downloaded:', info.version);
  console.log('🔄 Will install update on app quit...');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }

  // 靜默安裝：5秒後自動重啟
  setTimeout(() => {
    console.log('🔄 Restarting app to install update...');
    autoUpdater.quitAndInstall(false, true);
  }, 5000);
});

autoUpdater.on('error', (err) => {
  console.error('❌ Update error:', err.message);
  console.error('Error stack:', err.stack);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

(async () => {
  await app.whenReady();

  // Register IPC handlers
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-audio-path', async (_event, audioFile: string) => {
    if (isProd) {
      // In production, audio files are in the resources folder
      return path.join(process.resourcesPath, 'audios', audioFile);
    } else {
      // In development, audio files are in public/audios
      return path.join(app.getAppPath(), 'public', 'audios', audioFile);
    }
  });

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
