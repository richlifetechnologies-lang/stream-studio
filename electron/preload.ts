import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("isElectron", true);

contextBridge.exposeInMainWorld("electronAPI", {
  // Where the STREAM LIVE installer lives (resolved from its public release)
  onRetirementTarget: (
    callback: (info: { version: string; downloadUrl: string }) => void
  ) => {
    ipcRenderer.on("retirement-target", (_event, info) => callback(info));
  },
  getRetirementTarget: (): Promise<{ version: string; downloadUrl: string } | null> =>
    ipcRenderer.invoke("stream-live-target"),

  // Download progress (0–100)
  onDownloadProgress: (
    callback: (info: { percent: number; transferred: number; total: number }) => void
  ) => {
    ipcRenderer.on("download-progress", (_event, info) => callback(info));
  },

  // Installer fully downloaded — ready to run
  onDownloaded: (callback: () => void) => {
    ipcRenderer.on("update-downloaded", () => callback());
  },

  // Start the STREAM LIVE download
  downloadStreamLive: () => {
    ipcRenderer.send("download-stream-live");
  },

  // Last resort: show the releases page in the browser
  openStreamLive: () => {
    ipcRenderer.send("open-stream-live");
  },

  // Run the downloaded installer and close Stream Studio
  quitAndInstall: () => {
    ipcRenderer.send("quit-and-install");
  },

  // Mint a short-lived fal.ai JWT in the Main Process (keeps API key off renderer)
  getFalToken: (apiKey: string, appId: string): Promise<string> => {
    return ipcRenderer.invoke("get-fal-token", apiKey, appId);
  },

  // ─── Virtual camera ("Stream Studio Camera") frame feeder ───────────────────
  vcamStart: (): Promise<{ supported: boolean; active: boolean; ready: boolean; error: string | null }> =>
    ipcRenderer.invoke("vcam-start"),
  vcamStop: (): Promise<{ supported: boolean; active: boolean; ready: boolean; error: string | null }> =>
    ipcRenderer.invoke("vcam-stop"),
  vcamStatus: (): Promise<{ supported: boolean; active: boolean; ready: boolean; error: string | null; cameraName: string }> =>
    ipcRenderer.invoke("vcam-status"),
  // High-frequency RGBA8 frame push (fire-and-forget)
  vcamFrame: (buf: ArrayBuffer, width: number, height: number): void => {
    ipcRenderer.send("vcam-frame", buf, width, height);
  },
});
