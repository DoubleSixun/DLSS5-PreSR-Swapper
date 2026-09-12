'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nrApp', Object.freeze({
  getState: () => ipcRenderer.invoke('app:get-state'),
  setLanguage: language => ipcRenderer.invoke('app:set-language', language),
  rescanGames: () => ipcRenderer.invoke('games:rescan'),
  addGame: () => ipcRenderer.invoke('games:add'),
  selectGame: id => ipcRenderer.invoke('games:select', id),
  removeGame: id => ipcRenderer.invoke('games:remove', id),
  openGameFolder: id => ipcRenderer.invoke('game:open-folder', id),
  setGameSettings: (id, settings) => ipcRenderer.invoke('game:set-settings', id, settings),
  importRuntime: id => ipcRenderer.invoke('runtime:import', id),
  install: id => ipcRenderer.invoke('game:install', id),
  restore: id => ipcRenderer.invoke('game:restore', id),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
}));
