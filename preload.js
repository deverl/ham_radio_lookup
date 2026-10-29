'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ham', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  search: (query) => ipcRenderer.invoke('search', query),
  setEngine: (engine) => ipcRenderer.invoke('set-engine', engine),
  saveConnection: (settings) => ipcRenderer.invoke('save-connection', settings),
  testConnection: (settings) => ipcRenderer.invoke('test-connection', settings),
  startUpdate: () => ipcRenderer.invoke('start-update'),
  cancelUpdate: () => ipcRenderer.invoke('cancel-update'),
  exportCSV: (csv) => ipcRenderer.invoke('export-csv', csv),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  menuState: (state) => ipcRenderer.send('menu-state', state),
  resizeSettings: (height) => ipcRenderer.send('resize-settings', height),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  maintain: () => ipcRenderer.invoke('request-maintain'),
  on(channel, listener) {
    const allowed = new Set(['state', 'update-progress', 'menu-command']);
    if (!allowed.has(channel)) return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
