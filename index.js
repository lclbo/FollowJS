"use strict";
const {app, BrowserWindow} = require('electron');
const path = require('path');

let winRef;

async function createWindow () {
  winRef = new BrowserWindow({
    backgroundColor: 'teal',
    show: false,
    webPreferences: {
      devTools: true,
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    },
    width: 850,
    height: 600,
    resizable: true,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    fullscreen: true,
    fullscreenable: true
  });
  // winRef.setAlwaysOnTop(true);
  // winRef.webContents.openDevTools();

  // !IMPORTANT: Needs to be defined before loadFile or won't be fired correctly on Windows
  // (see https://github.com/electron/electron/issues/25253#issuecomment-1299966191)
  winRef.once('ready-to-show', () => {
    winRef.show();
  });

  await winRef.loadFile(path.join(__dirname, 'main.html'), {query: {"app": app.getName(), "ver": app.getVersion()}});


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