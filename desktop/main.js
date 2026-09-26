// Golden Mirage for macOS: the web game in its own window, served from the app
// bundle (works offline) through a private app:// scheme.
const { app, BrowserWindow, protocol, net, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_DIR = path.join(__dirname, 'game');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
// use the discrete/fast GPU and never throttle the game
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    title: 'Golden Mirage', backgroundColor: '#0d0f14', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  // links (e.g. gambling help sites) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL('app://game/index.html');
}

// Browsers only allow pointer lock inside a click or key press, and never on Esc.
// The page asks for it here and the app grants it as if the player had clicked.
ipcMain.on('relock-mouse', e => {
  e.sender.executeJavaScript("document.getElementById('game3d').requestPointerLock()", true).catch(() => {});
});

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(GAME_DIR, rel));
    if (!file.startsWith(GAME_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, { role: 'reload', label: 'Restart Game' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
