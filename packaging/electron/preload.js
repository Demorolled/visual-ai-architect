'use strict';
/**
 * Preload — the only bridge between the web UI and the Electron main process.
 * contextIsolation is ON and nodeIntegration is OFF, so the app pages cannot
 * touch Node directly; they get exactly these functions and nothing else.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('veronica', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getStatus: () => ipcRenderer.invoke('status:get'),
  openRuntime: () => ipcRenderer.invoke('runtime:open'),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  /**
   * The real on-disk location of a dropped File.
   *
   * Electron 32 removed the non-standard `File.path`, so `webUtils` is the
   * supported way to recover it — and since contextIsolation is ON the renderer
   * cannot reach `webUtils` itself, so it is bridged here. Deep Scan uses this to
   * hand REA the artifact itself: a dropped APK/EXE/DLL never travels through a
   * browser drop as bytes, so its PATH is the only way it can be analyzed.
   *
   * Returns '' when there is no path (e.g. a synthetic File with no file behind
   * it), which the UI treats as "stage the dropped text instead".
   */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
});
