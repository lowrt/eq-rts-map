const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 給渲染進程
contextBridge.exposeInMainWorld('electronAPI', {
  // 更新相關
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 更新事件監聽
  onUpdateChecking: (callback) => ipcRenderer.on('update-checking', callback),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (event, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (event, error) => callback(error)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info)),

  // 移除監聽器
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-checking');
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-not-available');
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  },

  // 其他功能
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAudioPath: (audioFile) => ipcRenderer.invoke('get-audio-path', audioFile),
});
