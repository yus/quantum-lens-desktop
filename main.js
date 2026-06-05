const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let audioEngine = null;

// Enable live reload in development
if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#1a1a1a',
        show: false,
        frame: true,
        titleBarStyle: 'default'
    });

    mainWindow.loadFile('index.html');
    
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Create application menu
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Audio File',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => mainWindow.webContents.send('menu-open-file')
                },
                {
                    label: 'Export Processed Audio',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('menu-export')
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'Mode',
            submenu: [
                {
                    label: 'Lens Mode (Clean)',
                    type: 'radio',
                    checked: true,
                    click: () => mainWindow.webContents.send('mode-switch', 'lens')
                },
                {
                    label: 'Barrier Mode (Divergent)',
                    type: 'radio',
                    click: () => mainWindow.webContents.send('mode-switch', 'barrier')
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Reset Zoom', role: 'resetZoom' },
                { label: 'Zoom In', role: 'zoomIn' },
                { label: 'Zoom Out', role: 'zoomOut' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Quantum Lens',
                    click: () => {
                        const fs = require('fs');
                        const path = require('path');
                        const iconPath = path.join(__dirname, 'assets', 'icon.png');
                        let iconData = null;
                        if (fs.existsSync(iconPath)) {
                            iconData = fs.readFileSync(iconPath).toString('base64');
                        }
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Unlimited Quantum Divergence',
                            message: 'UQD Quantum Lens Audio Processor',
                            detail: `Version 2.1.0\n\nBased on optical formulas from Aalener Optik-Formelrechner\nDivergent barrier: ∫ 1/|x| dx = ∞ at p=1.0\n\n“Unlimited Quantum Divergence” — poetry by @yus\n\nUniversity of Quantum Divergence Audio Lab`,
                            buttons: ['OK'],
                            icon: iconData ? Buffer.from(iconData, 'base64') : null
                        });
                    }
                },
                {
                    label: 'Documentation',
                    click: () => {
                        const { shell } = require('electron');
                        shell.openExternal('https://github.com/yus/quantum-lens-desktop/blob/main/README.md');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    createWindow();
    
    // Load audio engine
    audioEngine = require('./quantum-engine.js');
    
    // IPC handlers
    ipcMain.handle('process-audio', async (event, bufferData, params) => {
        console.log('Processing audio with params:', params);
        const result = await audioEngine.processBuffer(bufferData, params);
        return Array.from(result);
    });
    
    ipcMain.handle('get-transfer-points', async (event, params) => {
        return audioEngine.getTransferFunctionPoints(params);
    });
    
    ipcMain.handle('save-file', async (event, data, defaultPath) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultPath,
            filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, Buffer.from(data));
            return result.filePath;
        }
        return null;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
