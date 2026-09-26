// Tells the game it's running as the Mac app and lets it re-capture the mouse.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  relockMouse: () => ipcRenderer.send('relock-mouse'),
});
