const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Audio processing
    processAudio: (buffer, params) => ipcRenderer.invoke('process-audio', buffer, params),
    getTransferPoints: (params) => ipcRenderer.invoke('get-transfer-points', params),
    
    // File operations
    saveFile: (data, filename) => ipcRenderer.invoke('save-file', data, filename),
    
    // Menu events
    onMenuOpenFile: (callback) => ipcRenderer.on('menu-open-file', callback),
    onMenuExport: (callback) => ipcRenderer.on('menu-export', callback),
    onModeSwitch: (callback) => ipcRenderer.on('mode-switch', callback),
    
    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
