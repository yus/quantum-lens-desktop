// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Audio processing
    processAudio: (audioArray, params) => ipcRenderer.invoke('process-audio', audioArray, params),
    
    // Transfer function points for plot
    getTransferPoints: (params) => ipcRenderer.invoke('get-transfer-points', params),
    
    // File saving
    saveFile: (data, filename) => ipcRenderer.invoke('save-file', { data, filename }),
    
    // Menu events
    onMenuOpenFile: (callback) => ipcRenderer.on('menu-open-file', callback),
    onMenuExport: (callback) => ipcRenderer.on('menu-export', callback),
    onModeSwitch: (callback) => ipcRenderer.on('mode-switch', callback)
});

