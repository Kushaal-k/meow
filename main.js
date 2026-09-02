const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Trap any startup errors and show a native dialog box instead of failing silently
process.on('uncaughtException', (error) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', error);
    try {
        dialog.showErrorBox(
            'Application Startup Error',
            `An unexpected error occurred:\n\n${error && error.stack ? error.stack : error}`
        );
    } catch (dialogErr) {
        console.error('Failed to show error dialog:', dialogErr);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    try {
        dialog.showErrorBox(
            'Application Background Error',
            `An unhandled promise rejection occurred:\n\n${reason && reason.stack ? reason.stack : reason}`
        );
    } catch (dialogErr) {
        console.error('Failed to show error dialog:', dialogErr);
    }
});

// Configure Windows PATH for native sharp & libvips DLL dependencies
if (process.platform === 'win32') {
    const candidates = [
        path.join(process.cwd(), 'node_modules', '@img', 'sharp-win32-x64', 'lib'),
        path.join(__dirname, 'node_modules', '@img', 'sharp-win32-x64', 'lib'),
        process.resourcesPath ? path.join(process.resourcesPath, 'app', 'node_modules', '@img', 'sharp-win32-x64', 'lib') : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@img', 'sharp-win32-x64', 'lib') : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@img', 'sharp-libvips-win32-x64', 'lib') : null
    ].filter(Boolean);

    const validPaths = candidates.filter(dir => fs.existsSync(dir));
    if (validPaths.length > 0) {
        process.env.PATH = `${validPaths.join(';')};${process.env.PATH || ''}`;
    }
}

const { startServer, TEMP_ROOT, cleanupDirectory } = require('./server');

let mainWindow = null;
let serverInstance = null;
let serverPort = null;

function buildApplicationMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: 'About AI Badge Studio' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide', label: 'Hide AI Badge Studio' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit', label: 'Quit AI Badge Studio' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About AI Badge Studio',
                    click: () => {
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'AI Badge Studio',
                            message: 'AI Badge Studio v1.0.0',
                            detail: 'Intelligent AI Badge watermarking & processing application.\nRuns locally on your computer.',
                            icon: path.join(__dirname, 'assets', 'app-icon.png')
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow(port) {
    const iconPath = path.join(__dirname, 'assets', 'app-icon.png');

    mainWindow = new BrowserWindow({
        width: 1240,
        height: 860,
        minWidth: 900,
        minHeight: 650,
        title: 'AI Badge Studio',
        backgroundColor: '#0a100d',
        show: false,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    const targetUrl = `http://127.0.0.1:${port}`;
    console.log(`Loading application UI from: ${targetUrl}`);
    mainWindow.loadURL(targetUrl);

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Fallback timer: ensure window shows even if ready-to-show is delayed
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('Fallback show timer triggered');
            mainWindow.show();
            mainWindow.focus();
        }
    }, 1200);

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`Page failed to load: ${validatedURL} [${errorCode}: ${errorDescription}]`);
        dialog.showErrorBox(
            'Failed to Load UI',
            `Could not load the application interface:\n${errorDescription} (${errorCode})\nURL: ${validatedURL}`
        );
    });

    // Open any external links in the user's default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function startApp() {
    try {
        buildApplicationMenu();
        serverInstance = await startServer(3000, '127.0.0.1');
        serverPort = serverInstance.port;
        createWindow(serverPort);
    } catch (error) {
        console.error('Failed to initialize application:', error);
        dialog.showErrorBox(
            'Startup Error',
            `Could not start the internal backend server:\n\n${error.message || error}`
        );
        app.quit();
    }
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
        createWindow(serverPort);
    }
});

app.on('before-quit', async () => {
    if (serverInstance && typeof serverInstance.stopServer === 'function') {
        try {
            await serverInstance.stopServer();
        } catch (e) {
            console.error('Error stopping internal server:', e);
        }
    }
    if (TEMP_ROOT) {
        cleanupDirectory(TEMP_ROOT);
    }
});
