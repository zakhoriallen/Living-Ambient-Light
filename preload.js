const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayAPI", {
  getSystemVolume() {
    return ipcRenderer.invoke("system:get-volume");
  },
  listDisplays() {
    return ipcRenderer.invoke("display:list-sources");
  },
  setDisplaySource(sourceId) {
    return ipcRenderer.invoke("display:set-source", sourceId);
  },
  getWindowMode() {
    return ipcRenderer.invoke("window:get-mode");
  },
  setWindowMode(mode) {
    return ipcRenderer.invoke("window:set-mode", mode);
  },
  moveWindowOffCapture() {
    return ipcRenderer.invoke("window:move-off-capture");
  },
  getAccentColor() {
    return ipcRenderer.invoke("system:get-accent-color");
  },
  getWallpaperColor() {
    return ipcRenderer.invoke("system:get-wallpaper-color");
  },
  getNowPlayingColor() {
    return ipcRenderer.invoke("system:get-now-playing-color");
  },
  sendLedLevel(host, level, bass, mid, treble, palette, event, sequence, sentAt) {
    return ipcRenderer.invoke("esp32:set-level", host, level, bass, mid, treble, palette, event, sequence, sentAt);
  },
  sendLedPacket(payload) {
    ipcRenderer.send("led:send-packet", payload);
  },
  getLedStatus(host) {
    return ipcRenderer.invoke("esp32:get-status", host);
  },
  testLeds(host) {
    return ipcRenderer.invoke("esp32:test", host);
  },
  discoverLeds() {
    return ipcRenderer.invoke("esp32:discover");
  },
  exitApp() {
    return ipcRenderer.invoke("app:exit");
  }
});
