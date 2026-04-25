const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveDriverPath: (driverPath) => ipcRenderer.invoke('save-driver-path', driverPath),
});
