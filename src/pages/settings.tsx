import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout";
import { Key, Trash2, Eye, EyeOff, Save, LogOut, CheckCircle2, ExternalLink } from "lucide-react";
import {
  getApiKey, setApiKey, clearCredentials,
  getElevenLabsKey, setElevenLabsKey,
} from "../lib/credentials";
import { useToast } from "../hooks/use-toast";

const C   = "hsl(187 100% 52%)";
const E   = "hsl(265 90% 65%)";   // ElevenLabs purple accent
const BG  = "hsl(222 47% 4%)";

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // fal.ai
  const [newFalKey, setNewFalKey]   = useState("");
  const [showFalKey, setShowFalKey] = useState(false);
  const [falSaved, setFalSaved]     = useState(false);

  // ElevenLabs
  const [newElabsKey, setNewElabsKey]   = useState("");
  const [showElabsKey, setShowElabsKey] = useState(false);
  const [elabsSaved, setElabsSaved]     = useState(false);

  const currentFalKey   = getApiKey() ?? "";
  const currentElabsKey = getElevenLabsKey() ?? "";

  const maskedFal   = currentFalKey   ? currentFalKey.slice(0, 6)   + "••••••••" + currentFalKey.slice(-4)   : "Not set";
  const maskedElabs = currentElabsKey ? currentElabsKey.slice(0, 6) + "••••••••" + currentElabsKey.slice(-4) : "Not set";

  const handleSaveFal = () => {
    const k = newFalKey.trim();
    if (!k || k.length < 8) { toast({ title: "Key too short", variant: "destructive" }); return; }
    setApiKey(k); setNewFalKey(""); setFalSaved(true);
    setTimeout(() => setFalSaved(false), 2500);
    toast({ title: "fal.ai key saved" });
  };

  const handleSaveElabs = () => {
    const k = newElabsKey.trim();
    if (!k || k.length < 8) { toast({ title: "Key too short", variant: "destructive" }); return; }
    setElevenLabsKey(k); setNewElabsKey(""); setElabsSaved(true);
    setTimeout(() => setElabsSaved(false), 2500);
    toast({ title: "ElevenLabs key saved" });
  };

  const handleClear = () => {
    if (!confirm("Remove all API keys from this device?")) return;
    clearCredentials(); setLocation("/");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 40px 10px 40px",
    background: BG, border: "1px solid hsl(222 40% 14%)",
    borderRadius: 8, color: "hsl(190 80% 96%)",
    fontSize: 14, fontFamily: "'Rajdhani', sans-serif", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700,
    color: "hsl(222 25% 50%)", textTransform: "uppercase",
    letterSpacing: "0.12em", fontFamily: "'Orbitron', monospace", marginBottom: 8,
  };

  const keyRow = (label: string, masked: string, accent: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "hsl(222 40% 8%)", borderRadius: 8, border: "1px solid hsl(222 40% 12%)" }}>
      <Key style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, color: "hsl(222 25% 45%)", fontFamily: "'Orbitron', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 13, color: "hsl(190 80% 90%)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masked}</p>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div style={{ padding: 32, maxWidth: 640 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Orbitron', monospace", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", color: "hsl(190 80% 96%)", marginBottom: 4 }}>
            Account Settings
          </h1>
          <p style={{ color: "hsl(222 25% 50%)", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }}>
            Manage your API keys stored on this device
          </p>
        </div>

        {/* ── fal.ai ──────────────────────────────────────────────────────── */}
        <div style={{ background: "hsl(187 100% 52% / 0.06)", border: "1px solid hsl(187 100% 52% / 0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <Key style={{ width: 15, height: 15, color: C, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "hsl(190 80% 80%)", fontFamily: "'Rajdhani', sans-serif", flex: 1 }}>
            Get your fal.ai key at{" "}
            <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" style={{ color: C, fontWeight: 700, textDecoration: "none" }}>fal.ai/dashboard/keys</a>
          </p>
          <ExternalLink style={{ width: 13, height: 13, color: C, flexShrink: 0 }} />
        </div>

        <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 20, marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron', monospace", marginBottom: 14 }}>fal.ai API Key</p>
          {keyRow("Current fal.ai Key", maskedFal, C)}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={labelStyle}>New fal.ai Key</label>
              <div style={{ position: "relative" }}>
                <Key style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 40%)" }} />
                <input type={showFalKey ? "text" : "password"} value={newFalKey} onChange={e => setNewFalKey(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveFal(); }}
                  placeholder="Enter your fal.ai API Key" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }}
                  onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
                <button type="button" onClick={() => setShowFalKey(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 45%)", padding: 4 }}>
                  {showFalKey ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
                </button>
              </div>
            </div>
            <button onClick={handleSaveFal} disabled={!newFalKey.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, width: "fit-content", background: !newFalKey.trim() ? "hsl(222 40% 11%)" : falSaved ? "hsl(143 72% 35%)" : C, border: "none", cursor: !newFalKey.trim() ? "not-allowed" : "pointer", color: !newFalKey.trim() ? "hsl(222 25% 35%)" : "hsl(222 47% 4%)", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani', sans-serif" }}>
              {falSaved ? <CheckCircle2 style={{ width: 14, height: 14 }} /> : <Save style={{ width: 14, height: 14 }} />}
              {falSaved ? "Saved!" : "Save fal.ai Key"}
            </button>
          </div>
        </div>

        {/* ── ElevenLabs ──────────────────────────────────────────────────── */}
        <div style={{ background: "hsl(265 90% 65% / 0.06)", border: "1px solid hsl(265 90% 65% / 0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <Key style={{ width: 15, height: 15, color: E, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "hsl(265 80% 85%)", fontFamily: "'Rajdhani', sans-serif", flex: 1 }}>
            Get your ElevenLabs key at{" "}
            <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: E, fontWeight: 700, textDecoration: "none" }}>elevenlabs.io/app/settings/api-keys</a>
          </p>
          <ExternalLink style={{ width: 13, height: 13, color: E, flexShrink: 0 }} />
        </div>

        <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 20, marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: E, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron', monospace", marginBottom: 14 }}>ElevenLabs API Key (Voice Cloning)</p>
          {keyRow("Current ElevenLabs Key", maskedElabs, E)}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ ...labelStyle, color: "hsl(265 70% 60%)" }}>New ElevenLabs Key</label>
              <div style={{ position: "relative" }}>
                <Key style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 40%)" }} />
                <input type={showElabsKey ? "text" : "password"} value={newElabsKey} onChange={e => setNewElabsKey(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveElabs(); }}
                  placeholder="Enter your ElevenLabs API Key" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = "hsl(265 90% 65% / 0.5)"; }}
                  onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
                <button type="button" onClick={() => setShowElabsKey(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 45%)", padding: 4 }}>
                  {showElabsKey ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
                </button>
              </div>
            </div>
            <button onClick={handleSaveElabs} disabled={!newElabsKey.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, width: "fit-content", background: !newElabsKey.trim() ? "hsl(222 40% 11%)" : elabsSaved ? "hsl(143 72% 35%)" : E, border: "none", cursor: !newElabsKey.trim() ? "not-allowed" : "pointer", color: !newElabsKey.trim() ? "hsl(222 25% 35%)" : "#fff", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani', sans-serif" }}>
              {elabsSaved ? <CheckCircle2 style={{ width: 14, height: 14 }} /> : <Save style={{ width: 14, height: 14 }} />}
              {elabsSaved ? "Saved!" : "Save ElevenLabs Key"}
            </button>
          </div>
        </div>

        {/* ── Danger zone ─────────────────────────────────────────────────── */}
        <div style={{ background: "hsl(0 60% 7%)", border: "1px solid hsl(0 85% 40% / 0.25)", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Trash2 style={{ width: 15, height: 15, color: "hsl(0 85% 65%)" }} />
            <p style={{ fontWeight: 700, fontSize: 14, color: "hsl(0 85% 75%)", fontFamily: "'Rajdhani', sans-serif" }}>Danger Zone</p>
          </div>
          <p style={{ fontSize: 13, color: "hsl(0 50% 60%)", marginBottom: 14, fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.5 }}>
            Remove all API keys (fal.ai + ElevenLabs) from this device.
          </p>
          <button onClick={handleClear}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, background: "hsl(0 85% 40% / 0.2)", border: "1px solid hsl(0 85% 40% / 0.4)", cursor: "pointer", color: "hsl(0 85% 70%)", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani', sans-serif" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.35)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.2)"; }}>
            <LogOut style={{ width: 13, height: 13 }} />
            Remove All Keys &amp; Log Out
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
