const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("smoketestDesktop", {
  platform: process.platform,
  setTitleBarColors: (colors) =>
    ipcRenderer.invoke("titlebar:set-colors", colors),
});
