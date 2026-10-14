import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import StreamPage from "./pages/stream";
import SettingsPage from "./pages/settings";
import UsagePage from "./pages/usage";
import PopoutPage from "./pages/popout";
import ObsoutPage from "./pages/obsout";
import ObsoutPortraitPage from "./pages/obsoutp";
import Toaster from "./components/toaster";

const C = "hsl(187 100% 52%)";

declare global {
  interface Window {
    isElectron?: boolean;
    __ssRemoteStream?: MediaStream | null;
    electronAPI?: {
      onRetirementTarget: (cb: (info: { version: string; downloadUrl: string }) => void) => void;
      getRetirementTarget: () => Promise<{ version: string; downloadUrl: string } | null>;
      onDownloadProgress: (cb: (info: { percent: number; transferred: number; total: number }) => void) => void;
      onDownloaded: (cb: () => void) => void;
      downloadStreamLive: () => void;
      openStreamLive: () => void;
      quitAndInstall: () => void;
      getFalToken: (apiKey: string, appId: string) => Promise<string>;
      vcamStart: () => Promise<unknown>;
      vcamStop: () => Promise<unknown>;
      vcamStatus: () => Promise<unknown>;
      vcamFrame: (buf: ArrayBuffer, w: number, h: number) => void;
    };
  }
}

type GateState = "checking" | "ready" | "downloading" | "downloaded" | "unreachable";

export function RetirementGate() {
  const [state, setState] = useState<GateState>("checking");
  const [target, setTarget] = useState<{ version: string; downloadUrl: string } | null>(null);
  const [percent, setPercent] = useState(0);
  const settled = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setState("unreachable");
      return;
    }
    api.onRetirementTarget((info) => {
      settled.current = true;
      setTarget(info);
      setState((s) => (s === "downloading" || s === "downloaded" ? s : "ready"));
    });
    api.onDownloadProgress((info) => {
      setState("downloading");
      setPercent(info.percent);
    });
    api.onDownloaded(() => {
      setState("downloaded");
      setPercent(100);
    });
    // The main process may already have resolved it before React mounted.
    api.getRetirementTarget().then((info) => {
      if (info) {
        settled.current = true;
        setTarget(info);
        setState((s) => (s === "downloading" || s === "downloaded" ? s : "ready"));
      }
    });
    const timeout = setTimeout(() => {
      if (!settled.current) setState("unreachable");
    }, 15000);
    return () => clearTimeout(timeout);
  }, []);

  const download = () => {
    setState("downloading");
    setPercent(0);
    window.electronAPI?.downloadStreamLive();
  };

  const install = () => window.electronAPI?.quitAndInstall();
  const openPage = () => window.electronAPI?.openStreamLive();

  const action =
    state === "downloaded" ? (
      <button onClick={install} style={ctaStyle}>
        Install &amp; restart
      </button>
    ) : state === "downloading" ? (
      <div style={progressWrap}>
        <div style={{ ...progressFill, width: `${percent}%` }} />
        <span style={progressText}>{percent}%</span>
      </div>
    ) : state === "ready" ? (
      <button onClick={download} style={ctaStyle}>
        Download STREAM LIVE
      </button>
    ) : state === "unreachable" ? (
      <button onClick={openPage} style={ctaStyle}>
        Open the download page
      </button>
    ) : (
      <div style={checkingStyle}>Checking for the latest version…</div>
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "linear-gradient(160deg, #050a14 0%, #070d1a 55%, #0a1424 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620, textAlign: "center" }}>
        <div style={{
          width: 64, height: 64, margin: "0 auto 22px", borderRadius: 18,
          background: "hsl(187 100% 52% / 0.12)", border: `1px solid ${C}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 40px hsl(187 100% 52% / 0.18)",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12M7 10l5 5 5-5M4 20h16" stroke={C} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase",
          color: C, fontFamily: "'Orbitron', monospace", marginBottom: 14,
        }}>
          Stream Studio is retired
        </div>

        <h1 style={{
          margin: "0 0 16px", color: "hsl(0 0% 100%)",
          fontFamily: "'Orbitron', monospace", fontSize: 30, lineHeight: 1.25, fontWeight: 700,
        }}>
          Get STREAM LIVE
        </h1>

        <p style={{
          margin: "0 auto 10px", maxWidth: 520, color: "hsl(222 25% 72%)",
          fontFamily: "'Rajdhani', sans-serif", fontSize: 17, lineHeight: 1.6,
        }}>
          This app no longer starts calls. Everything it did now lives in{" "}
          <strong style={{ color: "hsl(0 0% 96%)" }}>STREAM LIVE</strong> — the same AI video and
          voice, with your minutes handled for you, so there is nothing to configure.
        </p>

        <p style={{
          margin: "0 auto 28px", maxWidth: 520, color: "hsl(222 25% 55%)",
          fontFamily: "'Rajdhani', sans-serif", fontSize: 15, lineHeight: 1.6,
        }}>
          Download it below and your existing OBS camera and audio setup keeps working.
          {target && (
            <> STREAM LIVE v{target.version} is the current release.</>
          )}
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          {action}
          {(state === "ready" || state === "downloaded") && (
            <button onClick={openPage} style={textLink}>
              or open the download page in your browser
            </button>
          )}
        </div>

        <div style={{
          marginTop: 34, paddingTop: 18, borderTop: "1px solid hsl(222 40% 14%)",
          color: "hsl(222 25% 42%)", fontFamily: "'Rajdhani', sans-serif", fontSize: 13,
        }}>
          <div style={{ marginBottom: 6 }}>
            This screen appears every time Stream Studio is opened, until STREAM LIVE is installed.
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "hsl(222 25% 35%)" }}>
            github.com/richlifetechnologies-lang/stream-live/releases/latest
          </div>
        </div>
      </div>
    </div>
  );
}

const ctaStyle: React.CSSProperties = {
  padding: "15px 34px", borderRadius: 12, border: "none", cursor: "pointer",
  background: `linear-gradient(135deg, ${C} 0%, hsl(200 100% 45%) 100%)`,
  color: "hsl(222 47% 4%)", fontSize: 15, fontWeight: 700,
  fontFamily: "'Orbitron', monospace", letterSpacing: "0.06em",
  boxShadow: "0 0 32px hsl(187 100% 52% / 0.35)",
};

const textLink: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 0,
  color: "hsl(222 25% 52%)", fontSize: 13, fontFamily: "'Rajdhani', sans-serif",
  textDecoration: "underline",
};

const checkingStyle: React.CSSProperties = {
  padding: "15px 30px", borderRadius: 12,
  background: "hsl(222 40% 11%)", border: "1px solid hsl(222 40% 18%)",
  color: "hsl(222 25% 55%)", fontSize: 13, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
};

const progressWrap: React.CSSProperties = {
  position: "relative", width: 320, height: 46, borderRadius: 12,
  background: "hsl(222 40% 11%)", border: `1px solid ${C}44`, overflow: "hidden",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const progressFill: React.CSSProperties = {
  position: "absolute", left: 0, top: 0, bottom: 0,
  background: `linear-gradient(90deg, ${C}33, hsl(200 100% 45% / 0.35))`,
  transition: "width 0.3s ease",
};

const progressText: React.CSSProperties = {
  position: "relative", color: C, fontSize: 13, fontWeight: 700,
  fontFamily: "'Orbitron', monospace", letterSpacing: "0.06em",
};

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Toaster />
      <Switch>
        <Route path="/popout">
          <PopoutPage />
        </Route>
        <Route path="/obsout">
          <ObsoutPage />
        </Route>
        <Route path="/obsout-portrait">
          <ObsoutPortraitPage />
        </Route>
        <Route path="/usage">
          <UsagePage />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route>
          <StreamPage />
        </Route>
      </Switch>
      <RetirementGate />
    </Router>
  );
}
