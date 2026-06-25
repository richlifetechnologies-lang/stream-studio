import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("isElectron", true);

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateAvailable: (
    callback: (info: { version: string; downloadUrl: string; releaseUrl: string }) => void
  ) => {
    ipcRenderer.on("update-available", (_event, info) => callback(info));
  },
  openExternal: (url: string) => {
    ipcRenderer.send("open-external", url);
  },
});
