import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Key, CheckCircle2, AlertCircle, Loader2, Zap, Monitor, Shield, Eye, EyeOff } from "lucide-react";
import { setApiKey, setSecretKey, hasCredentials } from "../lib/credentials";

const C = "hsl(187 100% 52%)";
const BG = "hsl(222 47% 4%)";

function LeftPanel() {
  return (
    <div style={{
      display: "none",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "50%",
      padding: "48px",
      position: "relative",
      overflow: "hidden",
      background: "hsl(222 50% 5%)",
      borderRight: "1px solid hsl(222 40% 10%)",
    }}
    className="left-panel"
    >
      {/* Radial glows */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 384, height: 384, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, hsl(187 100% 52% / 0.07) 0%, transparent 70%)", transform: "translate(-30%, -30%)" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 320, height: 320, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, hsl(210 100% 55% / 0.05) 0%, transparent 70%)", transform: "translate(20%, 20%)" }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 56 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(210 100% 55%) 100%)",
            boxShadow: "0 0 24px hsl(187 100% 52% / 0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 22, height: 22 }}>
              <polygon points="5,3 19,12 5,21" fill="hsl(222 47% 4%)" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.15em", color: "#fff", fontFamily: "'Orbitron', monospace", display: "block" }}>
              STREAM STUDIO
            </span>
            <p style={{ fontSize: 9, fontWeight: 700, color: C, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "'Orbitron', monospace", marginTop: 1 }}>
              Live Streaming Studio by Rich
            </p>
          </div>
        </div>

        <h2 style={{
          fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 16,
          background: "linear-gradient(135deg, #ffffff 0%, hsl(187 100% 75%) 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontFamily: "'Rajdhani', sans-serif",
        }}>
          Your Stream.<br />Reinvented Live.
        </h2>
        <p style={{ color: "#fff", fontWeight: 600, fontSize: 14, lineHeight: 1.6, marginBottom: 20, fontFamily: "'Rajdhani', sans-serif" }}>
          Real-time live video transformation. Transform your camera feed live for streaming, video calls, and content creation.
        </p>

        {/* BEFORE / AFTER preview */}
        <div style={{
          position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 20,
          border: "1px solid hsl(187 100% 52% / 0.2)", background: "hsl(222 47% 3%)", height: 170,
        }}>
          {/* BEFORE */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "calc(50% - 1px)", background: "hsl(222 44% 6%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="64" height="74" viewBox="0 0 64 74" fill="none">
              <ellipse cx="32" cy="30" rx="22" ry="24" fill="hsl(222 40% 14%)" stroke="hsl(222 40% 30%)" strokeWidth="1.5"/>
              <circle cx="24" cy="25" r="3" fill="hsl(222 40% 35%)"/>
              <circle cx="40" cy="25" r="3" fill="hsl(222 40% 35%)"/>
              <path d="M26 34 L29 39 L35 39 L38 34" fill="none" stroke="hsl(222 40% 30%)" strokeWidth="1.2"/>
              <path d="M23 45 Q32 51 41 45" fill="none" stroke="hsl(222 40% 32%)" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M26 54 L26 60 Q32 64 38 60 L38 54" fill="none" stroke="hsl(222 40% 25%)" strokeWidth="1.2"/>
            </svg>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "hsl(222 40% 50%)", fontFamily: "monospace" }}>BEFORE</span>
          </div>

          {/* Divider */}
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "hsl(187 100% 52% / 0.15)" }} />

          {/* AFTER */}
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "calc(50% - 1px)", background: "linear-gradient(135deg, hsl(187 100% 52% / 0.06), hsl(210 100% 55% / 0.04))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: "radial-gradient(ellipse, hsl(187 100% 52% / 0.18) 0%, transparent 70%)" }} />
              <svg width="64" height="74" viewBox="0 0 64 74" fill="none">
                <ellipse cx="32" cy="30" rx="22" ry="24" fill="hsl(187 100% 52% / 0.08)" stroke="hsl(187 100% 52% / 0.6)" strokeWidth="1.5"/>
                <circle cx="24" cy="25" r="3.5" fill="hsl(187 100% 52% / 0.7)"/>
                <circle cx="40" cy="25" r="3.5" fill="hsl(187 100% 52% / 0.7)"/>
                <path d="M26 34 L29 39 L35 39 L38 34" fill="none" stroke="hsl(187 100% 52% / 0.5)" strokeWidth="1.2"/>
                <path d="M23 45 Q32 52 41 45" fill="none" stroke="hsl(187 100% 52% / 0.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M26 54 L26 60 Q32 64 38 60 L38 54" fill="none" stroke="hsl(187 100% 52% / 0.4)" strokeWidth="1.2"/>
                <circle cx="32" cy="6" r="1.5" fill="hsl(187 100% 52% / 0.4)"/>
                <circle cx="56" cy="24" r="1" fill="hsl(210 100% 55% / 0.5)"/>
                <circle cx="8" cy="40" r="1" fill="hsl(187 100% 52% / 0.3)"/>
              </svg>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "hsl(187 100% 52% / 0.9)", fontFamily: "monospace" }}>AFTER</span>
          </div>

          {/* Swap badge */}
          <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            width: 30, height: 30, borderRadius: "50%", zIndex: 10,
            background: "linear-gradient(135deg, hsl(187 100% 52%), hsl(210 100% 55%))",
            boxShadow: "0 0 16px hsl(187 100% 52% / 0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 5H10M10 5L7 2M10 5L7 8" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 9H4M4 9L7 6M4 9L7 12" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* LIVE AI badge */}
          <div style={{ position: "absolute", top: 8, right: 10, zIndex: 5, fontSize: 8, fontWeight: 700, letterSpacing: "0.15em", color: C, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C, display: "inline-block", boxShadow: `0 0 6px ${C}`, animation: "pulse 2s infinite" }} />
            AI LIVE
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { icon: Zap,     text: "Real-time live video transformation" },
            { icon: Monitor, text: "OBS Studio virtual camera integration" },
            { icon: Shield,  text: "Your credentials stored locally, never shared" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", borderRadius: 12,
              background: "hsl(222 44% 7%)", border: "1px solid hsl(222 40% 12%)",
            }}>
              <Icon style={{ width: 15, height: 15, color: C, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom works-with strip */}
      <div style={{ position: "relative", zIndex: 1, padding: "14px 16px", borderRadius: 12, background: "linear-gradient(135deg, hsl(187 100% 52% / 0.08) 0%, hsl(210 100% 55% / 0.08) 100%)", border: "1px solid hsl(187 100% 52% / 0.18)", marginTop: 20 }}>
        <p style={{ fontSize: 11, color: "#fff", fontWeight: 700, marginBottom: 2, fontFamily: "'Rajdhani', sans-serif" }}>Works with</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'Rajdhani', sans-serif" }}>OBS Studio · Zoom · Teams · Discord · Google Meet</p>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const [apiKey, setApiKeyState] = useState("");
  const [secretKey, setSecretKeyState] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasCredentials()) setLocation("/");
  }, [setLocation]);

  const handleConnect = async () => {
    const ak = apiKey.trim();
    const sk = secretKey.trim();
    if (!ak) { setError("Please enter your API Key."); return; }
    if (!sk) { setError("Please enter your Secret Key."); return; }
    if (ak.length < 8) { setError("API Key appears too short. Please check and try again."); return; }
    setLoading(true);
    setError(null);
    // Simulate a brief validation feel then save
    await new Promise(r => setTimeout(r, 600));
    setApiKey(ak);
    setSecretKey(sk);
    setLoading(false);
    setLocation("/");
  };

  const inputStyle = (hasErr: boolean) => ({
    width: "100%",
    padding: "12px 44px 12px 44px",
    background: BG,
    border: `1px solid ${hasErr ? "hsl(0 84% 60% / 0.6)" : "hsl(187 100% 52% / 0.3)"}`,
    borderRadius: 8,
    color: "hsl(187 100% 90%)",
    fontSize: 14,
    fontFamily: "'Rajdhani', sans-serif",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  } as React.CSSProperties);

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: BG }}>
      <style>{`
        @media (min-width: 1024px) { .left-panel { display: flex !important; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <LeftPanel />

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Mobile logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }} className="mobile-logo">
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(210 100% 55%) 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px hsl(187 100% 52% / 0.4)" }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                <polygon points="5,3 19,12 5,21" fill="hsl(222 47% 4%)" />
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.15em", color: "#fff", fontFamily: "'Orbitron', monospace" }}>STREAM STUDIO</span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: "0.03em", fontFamily: "'Rajdhani', sans-serif" }}>
              Connect Your Account
            </h1>
            <p style={{ color: "hsl(222 25% 55%)", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }}>
              Enter your API Key and Secret Key to access the live streaming studio.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* API Key */}
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "hsl(222 25% 55%)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "'Orbitron', monospace", marginBottom: 8 }}>
                API Key
              </label>
              <div style={{ position: "relative" }}>
                <Key style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "hsl(222 25% 45%)" }} />
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => { setApiKeyState(e.target.value); setError(null); }}
                  onKeyDown={e => e.key === "Enter" && !loading && handleConnect()}
                  placeholder="Enter your API Key"
                  style={inputStyle(!!error && !apiKey.trim())}
                  onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.6)"; e.target.style.boxShadow = "0 0 0 2px hsl(187 100% 52% / 0.12)"; }}
                  onBlur={e => { e.target.style.borderColor = error && !apiKey.trim() ? "hsl(0 84% 60% / 0.6)" : "hsl(187 100% 52% / 0.3)"; e.target.style.boxShadow = "none"; }}
                  disabled={loading}
                  autoComplete="off"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 45%)", padding: 4 }}
                >
                  {showApiKey ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            </div>

            {/* Secret Key */}
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "hsl(222 25% 55%)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "'Orbitron', monospace", marginBottom: 8 }}>
                Secret Key
              </label>
              <div style={{ position: "relative" }}>
                <Shield style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "hsl(222 25% 45%)" }} />
                <input
                  type={showSecretKey ? "text" : "password"}
                  value={secretKey}
                  onChange={e => { setSecretKeyState(e.target.value); setError(null); }}
                  onKeyDown={e => e.key === "Enter" && !loading && handleConnect()}
                  placeholder="Enter your Secret Key"
                  style={{ ...inputStyle(!!error && !secretKey.trim()) }}
                  onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.6)"; e.target.style.boxShadow = "0 0 0 2px hsl(187 100% 52% / 0.12)"; }}
                  onBlur={e => { e.target.style.borderColor = error && !secretKey.trim() ? "hsl(0 84% 60% / 0.6)" : "hsl(187 100% 52% / 0.3)"; e.target.style.boxShadow = "none"; }}
                  disabled={loading}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 45%)", padding: 4 }}
                >
                  {showSecretKey ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, background: "hsl(0 84% 60% / 0.08)", border: "1px solid hsl(0 84% 60% / 0.3)", color: "hsl(0 84% 60%)", fontSize: 13, fontFamily: "'Rajdhani', sans-serif" }}>
                <AlertCircle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={loading || !apiKey.trim() || !secretKey.trim()}
              style={{
                width: "100%", height: 50,
                background: (!loading && apiKey.trim() && secretKey.trim())
                  ? "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)"
                  : "hsl(222 40% 11%)",
                border: "none", borderRadius: 10,
                color: (!loading && apiKey.trim() && secretKey.trim()) ? "hsl(222 47% 4%)" : "hsl(222 25% 35%)",
                fontSize: 15, fontWeight: 700, letterSpacing: "0.08em",
                fontFamily: "'Orbitron', monospace",
                cursor: (!loading && apiKey.trim() && secretKey.trim()) ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: (!loading && apiKey.trim() && secretKey.trim()) ? "0 0 24px hsl(187 100% 52% / 0.3)" : "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (!loading && apiKey.trim() && secretKey.trim()) (e.currentTarget as HTMLElement).style.filter = "brightness(1.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}
            >
              {loading
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Connecting…</>
                : <><CheckCircle2 style={{ width: 16, height: 16 }} /> Connect &amp; Enter Studio</>}
            </button>

            {/* Info strip */}
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "hsl(187 100% 52% / 0.05)", border: "1px solid hsl(187 100% 52% / 0.15)" }}>
              <p style={{ fontSize: 12, color: "hsl(222 25% 55%)", lineHeight: 1.6, fontFamily: "'Rajdhani', sans-serif" }}>
                <strong style={{ color: "hsl(187 100% 70%)" }}>Your keys are stored locally</strong> on this device only and never transmitted to any third party. They are used solely to power your live stream session.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 1024px) { .mobile-logo { display: none !important; } }
      `}</style>
    </div>
  );
}
