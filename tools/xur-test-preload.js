'use strict';
const { contextBridge } = require('electron');

// Minimaler Preload für den Xûr-Seitentest: verhindert nur Renderer-Fehler,
// weil im Test kein vollständiger IPC-Handler läuft.
const noop = async () => ({ ok: false });
contextBridge.exposeInMainWorld('api', new Proxy({}, {
  get: (target, key) => {
    if (key === 'onXurState' || key === 'onXurWindow' || key === 'onUiLanguage') return () => {};
    if (key === 'getUiLanguage') return async () => 'de';
    return noop;
  }
}));
