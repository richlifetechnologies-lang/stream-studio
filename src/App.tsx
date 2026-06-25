import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useState, useEffect } from "react";
import StreamPage from "./pages/stream";
import SettingsPage from "./pages/settings";
import PopoutPage from "./pages/popout";
import Toaster from "./components/toaster";

const C = "hsl(187 100% 52%)";

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
}

declare global {
  interface Window {
    isElectron?: boolean;
    electronAPI?: {
      onUpdateAvailable: (cb: (info: UpdateInfo) => void) => void;
      openExternal: (url: string) => void;
    };
  }
}

function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.electronAPI?.onUpdateAvailable((info) => {
      setUpdate(info);
    });
  }, []);

  if (!update || dismissed) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 20px",
      background: "linear-gradient(90deg, hsl(222 50% 6%) 0%, hsl(222 50% 8%) 100%)",
      borderBottom: `1px solid ${C}44`,
      boxShadow: `0 0 24px hsl(187 100% 52% / 0.12)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "hsl(187 100% 52% / 0.15)",
          border: `1px solid ${C}44`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke={C} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C, fontFamily: "'Orbitron', monospace", letterSpacing: "0.06em" }}>
            Update Available
          </span>
          <span style={{ fontSize: 12, color: "hsl(222 25% 65%)", fontFamily: "'Rajdhani', sans-serif", marginLeft: 8 }}>
            Stream Studio v{update.version} is ready to download
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => window.electronAPI?.openExternal(update.downloadUrl)}
          style={{
            padding: "6px 14px",
            borderRadius: 7,
            background: C,
            border: "none",
            cursor: "pointer",
            color: "hsl(222 47% 4%)",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'Orbitron', monospace",
            letterSpacing: "0.06em",
            boxShadow: `0 0 16px hsl(187 100% 52% / 0.3)`,
            transition: "filter 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}
        >
          Download
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: "6px 10px",
            borderRadius: 7,
            background: "hsl(222 40% 11%)",
            border: "1px solid hsl(222 40% 18%)",
            cursor: "pointer",
            color: "hsl(222 25% 50%)",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'Rajdhani', sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "hsl(222 25% 70%)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "hsl(222 25% 50%)"; }}
        >
          Later
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Toaster />
      <UpdateBanner />
      <Switch>
        <Route path="/popout">
          <PopoutPage />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route>
          <StreamPage />
        </Route>
      </Switch>
    </Router>
  );
}
