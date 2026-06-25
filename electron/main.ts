import { app, BrowserWindow, shell, session } from "electron";
import path from "path";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
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

  // Set permissive CSP for Decart / LiveKit WebRTC
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
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Open external links in the default browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("did-fail-load", () => {
    if (!isDev) {
      win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
