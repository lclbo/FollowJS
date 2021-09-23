const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');

let winRef;

async function createWindow () {
  winRef = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    width: 850,
    height: 600,
    titleBarStyle: 'hidden',
    fullscreen: true
  });
  // winRef.setAlwaysOnTop(true);
  winRef.loadURL(url.format({
    pathname: path.join(__dirname, 'main.html'),
    protocol: 'file:',
    slashes: true
  }));

  // winRef.openDevTools();

  winRef.on('closed', () => {
    winRef = null;
  })
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (!process.platform.includes('darwin')) {
    app.quit();
  }
});

app.on('activate', () => {
  if (winRef === null) {
    createWindow();
  }
});