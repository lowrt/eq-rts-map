import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import serve from 'electron-serve';
import path from 'path';

const isProd = app.isPackaged;
const loadURL = serve({
  directory: 'out',
  scheme: 'app'
});

const getPreloadPath = () => {
  return path.join(__dirname, 'preload.cjs');
};

let mainWindow: BrowserWindow | null;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;

if (app.isPackaged) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'ExpTechTW',
    repo: 'eq-rts-map',
    vPrefixedTagName: false,
  });
}

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
  console.log('🔄 Installing update and restarting app...');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }

  setTimeout(() => {
    console.log('🔄 Quitting and installing update...');
    autoUpdater.quitAndInstall(true, true);
  }, 3000);
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
      return path.join(process.resourcesPath, 'audios', audioFile);
    } else {
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
    await loadURL(mainWindow);
    await mainWindow.loadURL('app://-/home.html');
  } else {
    await mainWindow.loadURL('http://localhost:3000/home');
  }

  if (app.isPackaged) {
    console.log('📦 App version:', app.getVersion());
    console.log('🔄 Auto-update enabled. Feed URL:', autoUpdater.getFeedURL());

    autoUpdater.checkForUpdates().catch(err => {
      console.error('❌ Failed to check for updates:', err);
    });

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
      mainWindow.setMenu(null);
    } else {
      await mainWindow.loadURL('http://localhost:3000/home');
    }
  }
});
