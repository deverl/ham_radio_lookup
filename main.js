'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, dialog, clipboard, ipcMain, nativeTheme } = require('electron');

// A copied Linux build cannot use the setuid sandbox helper, so Electron
// aborts before a window appears. This has to be set before the app is ready.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('Ham Radio Lookup could not start', error.stack || String(error));
  app.exit(1);
});

process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && String(warning.message).includes('SQLite')) return;
  console.warn(warning.stack || warning.message);
});
const store = require('./src/settings-store');
const database = require('./src/database');
const { updateDatabase } = require('./src/updater');
const { maintenanceTitle } = require('./src/logic');

const windowIcon = path.join(__dirname, 'build', 'icon.png');

app.setName('Ham Radio Lookup');
app.setAboutPanelOptions({
  applicationName: 'Ham Radio Lookup',
  applicationVersion: '1.0.0',
});

let mainWindow = null;
let settingsWindow = null;
let updateRun = null;
let menuFlags = { canExport: false, canCopy: false, canMaintain: true, maintenanceTitle: 'Update License Database…' };

function chromeColor(kind) {
  const dark = nativeTheme.shouldUseDarkColors;
  if (kind === 'settings') return dark ? '#28282a' : '#ececec';
  return dark ? '#1e1e20' : '#ffffff';
}

function macWindowChrome() {
  if (process.platform !== 'darwin') return {};
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
  };
}

function reveal(window) {
  window.once('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => window.show());
}

function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1640,
    height: 865,
    minWidth: 900,
    minHeight: 520,
    title: 'Ham Radio Lookup',
    icon: windowIcon,
    backgroundColor: chromeColor('main'),
    show: process.platform === 'darwin' ? false : true,
    ...macWindowChrome(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  reveal(mainWindow);
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return mainWindow;
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 360,
    useContentSize: process.platform !== 'darwin',
    autoHideMenuBar: process.platform !== 'darwin',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Settings',
    icon: windowIcon,
    backgroundColor: chromeColor('settings'),
    show: process.platform === 'darwin' ? false : true,
    ...macWindowChrome(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.platform !== 'darwin') settingsWindow.setMenu(null);
  reveal(settingsWindow);
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
}

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function sendMain(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

function refreshMenu() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const maintenance = menu.getMenuItemById('maintenance');
  if (maintenance) {
    maintenance.label = menuFlags.maintenanceTitle;
    maintenance.enabled = menuFlags.canMaintain && !updateRun;
  }
  const exportItem = menu.getMenuItemById('export');
  if (exportItem) exportItem.enabled = menuFlags.canExport;
  const copyItem = menu.getMenuItemById('copy-rows');
  if (copyItem) copyItem.enabled = menuFlags.canCopy;
}

function installMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => createSettingsWindow() },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { id: 'export', label: 'Export Results…', accelerator: 'Shift+CmdOrCtrl+E', enabled: false, click: () => sendMain('menu-command', 'export') },
        { type: 'separator' },
        { role: 'close' },
      ],
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
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Filter Results', accelerator: 'CmdOrCtrl+F', click: () => sendMain('menu-command', 'focus-filter') },
        { id: 'copy-rows', label: 'Copy Selected Rows', accelerator: 'Shift+CmdOrCtrl+C', enabled: false, click: () => sendMain('menu-command', 'copy-selection') },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          id: 'maintenance',
          label: 'Update License Database…',
          click: () => sendMain('menu-command', 'maintain'),
        },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
  return true;
});

function publicState() {
  const snap = store.snapshot();
  return { ...snap, updating: Boolean(updateRun) };
}

ipcMain.handle('bootstrap', () => {
  const snap = publicState();
  menuFlags.maintenanceTitle = maintenanceTitle(snap.engine, snap.freshness);
  menuFlags.canMaintain = !updateRun;
  refreshMenu();
  return snap;
});

ipcMain.handle('request-maintain', () => {
  createMainWindow();
  mainWindow.show();
  mainWindow.focus();
  sendMain('menu-command', 'maintain');
  return true;
});

ipcMain.handle('set-engine', (_event, engine) => {
  const snap = store.setEngine(engine);
  menuFlags.maintenanceTitle = maintenanceTitle(snap.engine, snap.freshness);
  refreshMenu();
  const next = publicState();
  broadcast('state', next);
  return next;
});

ipcMain.handle('save-connection', (_event, settings) => {
  const saved = store.saveConnection(settings);
  const next = publicState();
  broadcast('state', next);
  return { snapshot: next, warning: saved.warning };
});

ipcMain.handle('test-connection', async (_event, settings) => {
  try {
    await database.testConnection(settings);
    const normalized = {
      host: String(settings.host || '').trim(),
      port: Number(settings.port),
      database: String(settings.database || '').trim(),
    };
    return { ok: true, message: `Connected to ${normalized.database} on ${normalized.host}:${normalized.port}.` };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('search', async (_event, query) => {
  const { engine, settings } = store.current();
  try {
    const rows = await database.search(engine, settings, store.databaseFile(), query);
    return {
      ok: true,
      records: rows.map((row) => ({ ...row, id: crypto.randomUUID() })),
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('export-csv', async (event, text) => {
  const window = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(window, {
    defaultPath: 'Ham Radio Lookup.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  const fs = require('fs');
  fs.writeFileSync(result.filePath, text);
  return { ok: true };
});

ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.on('menu-state', (_event, state) => {
  menuFlags = { ...menuFlags, ...state };
  refreshMenu();
});

ipcMain.on('resize-settings', (event, height) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== settingsWindow) return;
  const next = Math.min(780, Math.max(160, Math.ceil(height)));
  const [contentWidth] = window.getContentSize();
  const width = process.platform === 'darwin' ? contentWidth : Math.max(contentWidth, 560);
  window.setContentSize(width, next);
});

ipcMain.handle('start-update', async () => {
  if (updateRun) return { ok: false, message: 'An update is already running.' };
  const creating = store.snapshot().searchUnavailable;
  let cancelled = false;
  let lastSent = 0;
  updateRun = { cancel: () => { cancelled = true; } };
  refreshMenu();
  broadcast('state', publicState());
  const { engine, settings } = store.current();
  try {
    await updateDatabase({
      engine,
      settings,
      databaseFile: store.databaseFile(),
      isCancelled: () => cancelled,
      onProgress: (snapshot) => {
        const now = Date.now();
        const phaseChange = snapshot.fraction == null || snapshot.canCancel === false;
        if (!phaseChange && now - lastSent < 120) return;
        lastSent = now;
        sendMain('update-progress', snapshot);
      },
    });
    const snap = store.snapshot();
    sendMain('update-progress', {
      status: creating ? 'Database created' : 'Database updated',
      fraction: 1,
      detail: `The new records are used the next time you search. Downloaded files remain in ${snap.downloadDir}.`,
      canCancel: false,
      done: true,
    });
    broadcast('state', publicState());
    return { ok: true };
  } catch (error) {
    sendMain('update-progress', {
      status: 'Update stopped',
      fraction: null,
      detail: '',
      error: error.message,
      canCancel: false,
      done: true,
      replaced: Boolean(error.databaseReplaced),
    });
    broadcast('state', publicState());
    return { ok: false, message: error.message };
  } finally {
    updateRun = null;
    refreshMenu();
  }
});

ipcMain.handle('cancel-update', () => {
  updateRun?.cancel();
  return true;
});

app.whenReady().then(() => {
  installMenu();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

