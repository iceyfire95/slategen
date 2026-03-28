const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0f17',
    title: 'SlateGen — Test Pattern & Slate Generator'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Save single image ──────────────────────────────────────────────────────────
ipcMain.handle('save-image', async (event, { dataUrl, filename }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });

  if (canceled || !filePath) return { success: false };

  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, base64, 'base64');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Save batch of images ───────────────────────────────────────────────────────
ipcMain.handle('save-batch', async (event, { images }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    message: 'Select output folder for batch export'
  });

  if (canceled || !filePaths.length) return { success: false };

  const dir = filePaths[0];
  const saved = [];

  try {
    for (const img of images) {
      const filePath = path.join(dir, img.filename);
      const base64 = img.dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filePath, base64, 'base64');
      saved.push(filePath);
    }
    return { success: true, count: saved.length, dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
