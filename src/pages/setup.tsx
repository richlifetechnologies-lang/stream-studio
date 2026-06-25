import { useState } from "react";
import { useLocation } from "wouter";
import { Zap, Eye, EyeOff, ExternalLink } from "lucide-react";
import { setApiKey } from "../lib/credentials";

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const [apiKey, setApiKeyState] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed || trimmed.length < 10) {
      setError("Please enter a valid Decart API key.");
      return;
    }
    setApiKey(trimmed);
    setLocation("/");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "hsl(222 47% 4%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 460,
        background: "hsl(222 44% 6%)",
        border: "1px solid hsl(187 100% 52% / 0.2)",
        borderRadius: 20,
        padding: 40,
        boxShadow: "0 0 60px hsl(187 100% 52% / 0.08), 0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 32px hsl(187 100% 52% / 0.3)",
          }}>
            <Zap style={{ width: 28, height: 28, color: "hsl(222 47% 4%)" }} />
          </div>
        </div>

        <h1 style={{
          textAlign: "center", marginBottom: 6,
          fontFamily: "'Orbitron', monospace", fontWeight: 700,
          fontSize: 22, letterSpacing: "0.08em",
          color: "hsl(190 80% 96%)",
        }}>
          Stream Studio
        </h1>
        <p style={{ textAlign: "center", color: "hsl(222 25% 55%)", fontSize: 14, marginBottom: 32, fontFamily: "'Rajdhani', sans-serif" }}>
          Real-time AI face transformation powered by Decart Lucy 2.1
        </p>

        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "block", marginBottom: 8,
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
            color: "hsl(187 100% 52%)", textTransform: "uppercase",
            fontFamily: "'Orbitron', monospace",
          }}>
            Decart API Key
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => { setApiKeyState(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="sk_live_xxxxxxxxxxxxxxxx"
              style={{
                width: "100%", padding: "12px 44px 12px 14px",
                background: "hsl(222 47% 4%)",
                border: `1px solid ${error ? "hsl(0 85% 55% / 0.5)" : "hsl(222 40% 14%)"}`,
                borderRadius: 10, color: "hsl(190 80% 96%)",
                fontSize: 14, fontFamily: "'Rajdhani', sans-serif",
                outline: "none",
              }}
              onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; e.target.style.boxShadow = "0 0 0 2px hsl(187 100% 52% / 0.15)"; }}
              onBlur={e => { e.target.style.borderColor = error ? "hsl(0 85% 55% / 0.5)" : "hsl(222 40% 14%)"; e.target.style.boxShadow = "none"; }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "hsl(222 25% 50%)", padding: 4,
              }}
            >
              {showKey ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
            </button>
          </div>
          {error && (
            <p style={{ marginTop: 6, fontSize: 12, color: "hsl(0 85% 65%)", fontFamily: "'Rajdhani', sans-serif" }}>{error}</p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          style={{
            width: "100%", height: 52,
            background: apiKey.trim() ? "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)" : "hsl(222 40% 11%)",
            border: "none", borderRadius: 12,
            color: apiKey.trim() ? "hsl(222 47% 4%)" : "hsl(222 25% 40%)",
            fontSize: 15, fontWeight: 700, letterSpacing: "0.08em",
            fontFamily: "'Orbitron', monospace",
            cursor: apiKey.trim() ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: apiKey.trim() ? "0 0 24px hsl(187 100% 52% / 0.3)" : "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
          onMouseEnter={e => { if (apiKey.trim()) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}
        >
          <Zap style={{ width: 18, height: 18 }} />
          Launch Stream Studio
        </button>

        <div style={{
          marginTop: 24, padding: "14px 16px",
          background: "hsl(187 100% 52% / 0.06)",
          border: "1px solid hsl(187 100% 52% / 0.15)",
          borderRadius: 10,
        }}>
          <p style={{ fontSize: 12, color: "hsl(222 25% 60%)", lineHeight: 1.6, fontFamily: "'Rajdhani', sans-serif" }}>
            Your API key is stored locally on this device only. Get your key from{" "}
            <a
              href="https://app.decart.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "hsl(187 100% 52%)", textDecoration: "none" }}
            >
              app.decart.ai <ExternalLink style={{ width: 10, height: 10, display: "inline" }} />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
