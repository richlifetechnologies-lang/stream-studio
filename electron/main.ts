import { app, BrowserWindow, shell, session, ipcMain } from "electron";
import path from "path";
import https from "https";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

function checkForUpdates(win: BrowserWindow) {
  const currentVersion = app.getVersion();
  const req = https.get(
    {
      hostname: "api.github.com",
      path: "/repos/richlifetechnologies-lang/stream-studio/releases/latest",
      headers: { "User-Agent": `StreamStudio/${currentVersion}` },
    },
    (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk; });
      res.on("end", () => {
        try {
          const release = JSON.parse(data);
          const latestTag = (release.tag_name ?? "").replace(/^v/, "");
          if (latestTag && isNewer(latestTag, currentVersion)) {
            const exeAsset = (release.assets ?? []).find((a: { name: string }) =>
              a.name.endsWith(".exe")
            );
            win.webContents.send("update-available", {
              version: latestTag,
              downloadUrl: (exeAsset as { browser_download_url?: string } | undefined)?.browser_download_url ?? release.html_url,
              releaseUrl: release.html_url,
            });
          }
        } catch {
          // Ignore JSON parse errors
        }
      });
    }
  );
  req.on("error", () => { /* Ignore network errors — update check is best-effort */ });
  req.end();
}

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

  // Check for updates 5 seconds after the app loads (production only)
  win.webContents.once("did-finish-load", () => {
    if (!isDev) {
      setTimeout(() => checkForUpdates(win), 5000);
    }
  });

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

// IPC: open external URL (used by renderer for update download link)
ipcMain.on("open-external", (_event, url: string) => {
  shell.openExternal(url);
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
