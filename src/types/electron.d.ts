export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface ElectronAPI {
  // 更新相關
  checkForUpdates: () => Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  getAppVersion: () => Promise<string>;

  // 更新事件監聽
  onUpdateChecking: (callback: () => void) => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateError: (callback: (error: string) => void) => void;
  onUpdateDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void;

  // 移除監聽器
  removeUpdateListeners: () => void;

  // 其他功能
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  getAudioPath: (audioFile: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
