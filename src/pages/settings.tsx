import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout";
import { Settings, Key, Trash2, Eye, EyeOff, Save, LogOut } from "lucide-react";
import { getApiKey, setApiKey, clearCredentials } from "../lib/credentials";
import { useToast } from "../hooks/use-toast";

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const currentKey = getApiKey() ?? "";
  const maskedKey = currentKey ? currentKey.slice(0, 8) + "••••••••••••" + currentKey.slice(-4) : "Not set";

  const handleUpdate = () => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed.length < 10) {
      toast({ title: "Invalid key", description: "Please enter a valid API key.", variant: "destructive" });
      return;
    }
    setApiKey(trimmed);
    setNewKey("");
    toast({ title: "API key updated", description: "Your Decart API key has been saved." });
  };

  const handleClear = () => {
    if (!confirm("This will remove your API key and return you to setup. Continue?")) return;
    clearCredentials();
    setLocation("/setup");
  };

  return (
    <AppLayout>
      <div style={{ padding: 32, maxWidth: 600 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: "'Orbitron', monospace", fontWeight: 700,
            fontSize: 22, letterSpacing: "0.06em", color: "hsl(190 80% 96%)",
            marginBottom: 4,
          }}>
            Settings
          </h1>
          <p style={{ color: "hsl(222 25% 55%)", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }}>
            Manage your Decart API credentials
          </p>
        </div>

        {/* Current key */}
        <div style={{
          background: "hsl(222 44% 6%)",
          border: "1px solid hsl(222 40% 11%)",
          borderRadius: 14, padding: 20, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: "hsl(187 100% 52% / 0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Key style={{ width: 16, height: 16, color: "hsl(187 100% 52%)" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: "hsl(190 80% 96%)", fontFamily: "'Rajdhani', sans-serif" }}>Current API Key</p>
              <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "monospace" }}>{maskedKey}</p>
            </div>
          </div>

          <label style={{
            display: "block", marginBottom: 8,
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            color: "hsl(187 100% 52%)", textTransform: "uppercase",
            fontFamily: "'Orbitron', monospace",
          }}>
            New API Key
          </label>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type={showKey ? "text" : "password"}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUpdate()}
              placeholder="Enter new Decart API key…"
              style={{
                width: "100%", padding: "10px 40px 10px 12px",
                background: "hsl(222 47% 4%)",
                border: "1px solid hsl(222 40% 14%)",
                borderRadius: 8, color: "hsl(190 80% 96%)",
                fontSize: 14, fontFamily: "'Rajdhani', sans-serif", outline: "none",
              }}
              onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }}
              onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 50%)" }}
            >
              {showKey ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
            </button>
          </div>

          <button
            onClick={handleUpdate}
            disabled={!newKey.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 8,
              background: newKey.trim() ? "hsl(187 100% 52%)" : "hsl(222 40% 11%)",
              border: "none", cursor: newKey.trim() ? "pointer" : "not-allowed",
              color: newKey.trim() ? "hsl(222 47% 4%)" : "hsl(222 25% 40%)",
              fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani', sans-serif",
              transition: "all 0.2s",
            }}
          >
            <Save style={{ width: 14, height: 14 }} />
            Update Key
          </button>
        </div>

        {/* Danger zone */}
        <div style={{
          background: "hsl(0 60% 7%)",
          border: "1px solid hsl(0 85% 40% / 0.25)",
          borderRadius: 14, padding: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Trash2 style={{ width: 16, height: 16, color: "hsl(0 85% 65%)" }} />
            <p style={{ fontWeight: 700, fontSize: 14, color: "hsl(0 85% 75%)", fontFamily: "'Rajdhani', sans-serif" }}>Danger Zone</p>
          </div>
          <p style={{ fontSize: 13, color: "hsl(0 50% 60%)", marginBottom: 14, fontFamily: "'Rajdhani', sans-serif" }}>
            Remove your API key from this device. You'll be taken back to the setup screen.
          </p>
          <button
            onClick={handleClear}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 8,
              background: "hsl(0 85% 40% / 0.2)",
              border: "1px solid hsl(0 85% 40% / 0.4)",
              cursor: "pointer",
              color: "hsl(0 85% 70%)",
              fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani', sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.35)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.2)"; }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
            Remove Key &amp; Log Out
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
