const {app, BrowserWindow} = require('electron');
const path = require('path');

let winRef;

async function createWindow () {
  winRef = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    width: 850,
    height: 600,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    fullscreen: true
  });
  // winRef.setAlwaysOnTop(true);

  await winRef.loadFile(path.join(__dirname, 'main.html'));

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