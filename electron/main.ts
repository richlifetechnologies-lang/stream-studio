import { app, BrowserWindow, shell, session, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    win.webContents.send("update-available", { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    win.webContents.send("download-progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    win.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", () => {
    // Silently ignore update errors — update check is best-effort
  });

  // Check 5 s after window loads
  win.webContents.once("did-finish-load", () => {
    if (!isDev) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 5000);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Stream Studio",
    backgroundColor: "#070d1a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://*.decart.ai wss://*.decart.ai https://*.livekit.io wss://*.livekit.io https://fonts.googleapis.com https://fonts.gstatic.com; media-src *; connect-src *;",
        ],
      },
    });
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  setupAutoUpdater(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("did-fail-load", () => {
    if (!isDev && mainWindow) {
      mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  });
}

// IPC: trigger update download
ipcMain.on("download-update", () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

// IPC: quit and install the downloaded update
ipcMain.on("quit-and-install", () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
