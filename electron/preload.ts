import { contextBridge } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Add any API you want to expose to the renderer process here
  // Example:
  // sendMessage: (message: string) => ipcRenderer.send('message', message),
});
