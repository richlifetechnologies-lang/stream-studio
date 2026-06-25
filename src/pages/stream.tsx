import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "../components/layout";
import { useToast } from "../hooks/use-toast";
import { getApiKey, getSecretKey } from "../lib/credentials";
import {
  Zap, Square, Play, Camera, Monitor, Maximize2,
  RefreshCw, ChevronDown, Image, Loader2, X, Mic,
} from "lucide-react";

// ─── Decart SDK lazy loader ─────────────────────────────────────────────────
let _sdkCache: unknown = null;
async function getDecartSdk() {
  if (!_sdkCache) _sdkCache = await import("@decartai/sdk");
  return _sdkCache as {
    createDecartClient: (opts: { apiKey: string }) => {
      realtime: {
        connect: (stream: MediaStream, opts: {
          model: string;
          prompt: string;
          frameRate?: number;
        }) => Promise<{
          on: (ev: string, cb: (s: MediaStream) => void) => void;
          onConnectionStateChange: (cb: (state: string) => void) => void;
          disconnect: () => void;
          addImage: (img: string) => Promise<void>;
        }>;
      };
    };
    models: { LUCY: string };
  };
}

// ─── Style presets ──────────────────────────────────────────────────────────
const STYLES = [
  { id: "hyper-real",  label: "HYPER-REAL",  color: "#00d2d3", prompt: "photorealistic human, ultra-high-definition, natural skin texture, cinematic lighting, professional photography" },
  { id: "anime",       label: "ANIME",        color: "#a29bfe", prompt: "anime art style, cel shading, vibrant colors, clean lines, studio animation quality" },
  { id: "cinematic",   label: "CINEMATIC",    color: "#fdcb6e", prompt: "cinematic film look, dramatic lighting, movie quality, depth of field, anamorphic lens flare" },
  { id: "cyberpunk",   label: "CYBERPUNK",    color: "#fd79a8", prompt: "cyberpunk style, neon lights, futuristic city, chrome and neon, night scene, blade runner aesthetic" },
  { id: "fantasy",     label: "FANTASY",      color: "#55efc4", prompt: "fantasy art style, ethereal glow, mystical atmosphere, magical lighting, painterly quality" },
  { id: "horror",      label: "HORROR",       color: "#e17055", prompt: "horror film style, dark and sinister, dramatic shadows, unsettling atmosphere, desaturated with deep red accents" },
  { id: "neon-noir",   label: "NEON NOIR",    color: "#74b9ff", prompt: "neon noir style, rain-soaked streets, neon reflections, deep shadows, film noir meets cyberpunk" },
  { id: "watercolor",  label: "WATERCOLOR",   color: "#81ecec", prompt: "watercolor painting, soft brushstrokes, artistic, fluid colors, traditional art technique" },
  { id: "sketch",      label: "SKETCH",       color: "#dfe6e9", prompt: "pencil sketch style, hand-drawn, graphite lines, artistic rendering, detailed crosshatching" },
] as const;

type StyleId = typeof STYLES[number]["id"];

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const C = "hsl(187 100% 52%)";

export default function StreamPage() {
  const { toast } = useToast();

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [connectionStep, setConnectionStep] = useState<"token" | "decart" | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  // Camera
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraReady, setCameraReady] = useState(false);

  // Style & prompt
  const [selectedStyle, setSelectedStyle] = useState<StyleId>("hyper-real");
  const [customPrompt, setCustomPrompt] = useState("");

  // Audio
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioDelay, setAudioDelay] = useState(1.2);
  const [vuLevel, setVuLevel] = useState(0);
  const [micVolume, setMicVolume] = useState(1.0);

  // Reference image
  const [refImageB64, setRefImageB64] = useState<string | null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);

  // UI
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);
  const [isObsModeActive, setIsObsModeActive] = useState(false);
  const [obsInstructions, setObsInstructions] = useState(false);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const decartClientRef = useRef<{ disconnect?: () => void; addImage?: (img: string) => Promise<void> } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const vuAnimRef = useRef<number>(0);
  const vuAnalyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popoutWindowRef = useRef<Window | null>(null);
  const isStartingRef = useRef(false);
  const elapsedSecsRef = useRef(0);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // ─── Camera ──────────────────────────────────────────────────────────────
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter(d => d.kind === "videoinput");
      setCameras(vids);
      if (vids.length && !selectedCameraId) setSelectedCameraId(vids[0].deviceId);
    } catch { /* ignore */ }
  }, [selectedCameraId]);

  useEffect(() => { enumerateCameras(); }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    const id = deviceId ?? selectedCameraId;
    try {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCameraReady(true);
      await enumerateCameras();
    } catch {
      toast({ title: "Camera Error", description: "Could not access your camera. Check browser permissions.", variant: "destructive" });
    }
  }, [selectedCameraId, enumerateCameras, toast]);

  const handleCameraSwitch = useCallback(async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraReady) await startCamera(deviceId);
  }, [cameraReady, startCamera]);

  // ─── Audio ───────────────────────────────────────────────────────────────
  const setupAudio = useCallback(async () => {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(mic);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      const delay = ctx.createDelay(5.0); delay.delayTime.value = audioDelay;
      const gain = ctx.createGain(); gain.gain.value = micVolume;
      const dest = ctx.createMediaStreamDestination();
      src.connect(analyser); analyser.connect(delay); delay.connect(gain);
      gain.connect(dest); gain.connect(ctx.destination);
      audioContextRef.current = ctx; audioDestRef.current = dest;
      delayNodeRef.current = delay; gainNodeRef.current = gain; vuAnalyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setVuLevel(Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length / 128) * 100));
        vuAnimRef.current = requestAnimationFrame(tick);
      };
      vuAnimRef.current = requestAnimationFrame(tick);
    } catch { /* no mic */ }
  }, [audioDelay, micVolume]);

  const teardownAudio = useCallback(() => {
    cancelAnimationFrame(vuAnimRef.current); setVuLevel(0);
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    audioDestRef.current = null; delayNodeRef.current = null; gainNodeRef.current = null;
  }, []);

  useEffect(() => { if (delayNodeRef.current) delayNodeRef.current.delayTime.value = audioDelay; }, [audioDelay]);
  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = micVolume; }, [micVolume]);

  // ─── Teardown ─────────────────────────────────────────────────────────────
  const teardownStream = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isStartingRef.current = false;
    if (decartClientRef.current?.disconnect) { try { decartClientRef.current.disconnect(); } catch { /* ignore */ } }
    decartClientRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
      try { popoutWindowRef.current.postMessage("stream-studio-clear", "*"); } catch { /* ignore */ }
    }
    setIsStreaming(false); setConnectionStatus("idle");
    setConnectionStep(null); setElapsedSecs(0); elapsedSecsRef.current = 0;
  }, []);

  // ─── Start stream ─────────────────────────────────────────────────────────
  const handleStartStream = useCallback(async () => {
    if (isStartingRef.current || isStreaming) return;
    if (!cameraReady || !localStreamRef.current) {
      toast({ title: "Camera not ready", description: "Enable your camera first.", variant: "destructive" }); return;
    }
    const apiKey = getApiKey();
    const secretKey = getSecretKey();
    if (!apiKey) {
      toast({ title: "No API Key", description: "Go to Settings to enter your API Key and Secret Key.", variant: "destructive" }); return;
    }

    isStartingRef.current = true; setIsStarting(true);
    setConnectionStep("token"); setConnectionStatus("connecting");

    try {
      // Build combined auth token — use apiKey directly; secretKey available for future SDK auth
      const authToken = secretKey ? `${apiKey}:${secretKey}` : apiKey;
      void authToken; // SDK uses apiKey parameter directly for now

      setConnectionStep("decart");
      const style = STYLES.find(s => s.id === selectedStyle)!;
      const prompt = customPrompt.trim() || style.prompt;

      const { createDecartClient, models } = await getDecartSdk();
      const client = createDecartClient({ apiKey });

      // Combined stream with optional audio
      let combinedStream = localStreamRef.current;
      if (audioEnabled && audioDestRef.current) {
        const audioTrack = audioDestRef.current.stream.getAudioTracks()[0];
        if (audioTrack) {
          combinedStream = new MediaStream([...localStreamRef.current.getVideoTracks(), audioTrack]);
        }
      }

      const realtimeClient = await client.realtime.connect(combinedStream, {
        model: models.LUCY ?? "lucy-2.1",
        prompt,
        frameRate: 30,
      });

      decartClientRef.current = realtimeClient;

      realtimeClient.on("track", (remoteStream: MediaStream) => {
        remoteStreamRef.current = remoteStream;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
          try { popoutWindowRef.current.postMessage({ type: "stream-studio-stream", stream: remoteStream }, "*"); } catch { /* ignore */ }
        }
        setConnectionStatus("connected");
      });

      realtimeClient.onConnectionStateChange((state: string) => {
        if (state === "connected") setConnectionStatus("connected");
        else if ((state === "disconnected" || state === "failed") && isStartingRef.current) {
          teardownStream();
          toast({ title: "Stream disconnected", description: "The connection was lost. Try streaming again.", variant: "destructive" });
        }
      });

      if (refImageB64) { try { await realtimeClient.addImage(refImageB64); } catch { /* non-fatal */ } }

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSecs(s); elapsedSecsRef.current = s;
      }, 1000);

      setIsStreaming(true); setConnectionStatus("connected");
    } catch (err) {
      teardownStream();
      toast({
        title: "Stream Failed",
        description: err instanceof Error ? err.message : "Could not connect. Check your API Key and Secret Key in Settings.",
        variant: "destructive",
      });
    } finally {
      isStartingRef.current = false; setIsStarting(false);
    }
  }, [isStreaming, cameraReady, selectedStyle, customPrompt, audioEnabled, refImageB64, teardownStream, toast]);

  const handleStopStream = useCallback(() => {
    teardownStream(); teardownAudio(); setAudioEnabled(false);
  }, [teardownStream, teardownAudio]);

  const handleAudioToggle = useCallback(async () => {
    if (audioEnabled) { teardownAudio(); setAudioEnabled(false); }
    else { await setupAudio(); setAudioEnabled(true); }
  }, [audioEnabled, setupAudio, teardownAudio]);

  // ─── Reference image ──────────────────────────────────────────────────────
  const handleRefImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const r = ev.target?.result as string;
      setRefImagePreview(r); setRefImageB64(r.split(",")[1] ?? r);
      if (decartClientRef.current?.addImage) decartClientRef.current.addImage(r.split(",")[1] ?? r).catch(() => {});
    };
    reader.readAsDataURL(file); e.target.value = "";
  }, []);

  // ─── OBS / Popout ─────────────────────────────────────────────────────────
  const openPopout = useCallback(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) { popoutWindowRef.current.focus(); return; }
    const w = window.open("/popout", "ss-popout", "width=1280,height=720,menubar=no,toolbar=no,location=no");
    if (w) {
      popoutWindowRef.current = w; setIsPopoutOpen(true);
      w.addEventListener("load", () => {
        if (remoteStreamRef.current) { try { w.postMessage({ type: "stream-studio-stream", stream: remoteStreamRef.current }, "*"); } catch { /* ignore */ } }
      });
      const chk = setInterval(() => { if (w.closed) { clearInterval(chk); setIsPopoutOpen(false); setIsObsModeActive(false); popoutWindowRef.current = null; } }, 1000);
    }
  }, []);

  const openObsMode = useCallback(() => { openPopout(); setIsObsModeActive(true); setObsInstructions(true); }, [openPopout]);
  const closePopout = useCallback(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) popoutWindowRef.current.close();
    popoutWindowRef.current = null; setIsPopoutOpen(false); setIsObsModeActive(false); setObsInstructions(false);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === "stream-studio-stop") { teardownStream(); teardownAudio(); setAudioEnabled(false); }
      else if (e.data === "stream-studio-reconnect" && !isStreaming && cameraReady) handleStartStream();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [teardownStream, teardownAudio, isStreaming, cameraReady, handleStartStream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closePopout(); if (isStreaming) teardownStream(); setIsFullscreen(false); return; }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); openPopout(); setIsFullscreen(prev => !prev); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStreaming, teardownStream, closePopout, openPopout]);

  const style = STYLES.find(s => s.id === selectedStyle)!;

  return (
    <AppLayout>
      {/* Starting overlay */}
      {isStarting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(8px)", background: "hsl(222 47% 4% / 0.88)" }} />
          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 360, width: "100%", margin: "0 16px", textAlign: "center", padding: 36, borderRadius: 20, background: "hsl(222 44% 6%)", border: "1px solid hsl(187 100% 52% / 0.22)", boxShadow: "0 0 60px hsl(187 100% 52% / 0.14)" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "hsl(187 100% 52% / 0.08)", border: "2px solid hsl(187 100% 52% / 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 style={{ width: 32, height: 32, color: C, animation: "spin 1s linear infinite" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 16, letterSpacing: "0.06em", color: "hsl(190 80% 96%)", marginBottom: 8 }}>Starting Stream…</h3>
              <p style={{ fontSize: 13, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>
                {connectionStep === "decart" ? "2/2 · Connecting to AI engine…" : "1/2 · Validating credentials…"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%", padding: "0 8px" }}>
              {(["token", "decart"] as const).map((step, i) => {
                const order = ["token", "decart"] as const;
                const currentIdx = order.indexOf(connectionStep ?? "token");
                return <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, transition: "all 0.5s", background: i < currentIdx ? C : i === currentIdx ? "hsl(187 100% 52% / 0.45)" : "hsl(222 40% 14%)" }} />;
              })}
            </div>
            <button onClick={() => { isStartingRef.current = false; setIsStarting(false); setConnectionStatus("idle"); setConnectionStep(null); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, width: "100%", justifyContent: "center", background: "transparent", border: "1px solid hsl(187 100% 52% / 0.25)", color: "hsl(187 100% 52% / 0.8)", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer" }}>
              <X style={{ width: 14, height: 14 }} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", color: "hsl(190 80% 96%)", marginBottom: 2 }}>Live Stream</h1>
            <p style={{ fontSize: 13, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Real-time AI video transformation</p>
          </div>
          {isStreaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 10, background: "hsl(0 85% 55% / 0.1)", border: "1px solid hsl(0 85% 55% / 0.2)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(0 85% 65%)", animation: "pulse 2s ease-in-out infinite" }} />
              <span style={{ color: "hsl(0 85% 70%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em" }}>{formatTime(elapsedSecs)}</span>
              {connectionStatus === "connected" && <span style={{ fontSize: 11, color: "hsl(143 72% 55%)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>● LIVE</span>}
            </div>
          )}
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", gap: 20 }}>
          {/* Left col */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Output video */}
            <div style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 9999, borderRadius: 0, background: "#000" } : {
              position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000",
              boxShadow: connectionStatus === "connected" ? `0 0 40px hsl(187 100% 52% / 0.25), 0 0 0 1px hsl(187 100% 52% / 0.15)` : "0 0 0 1px hsl(222 40% 14%)",
            }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scaleX(-1)" }} />

              {connectionStatus === "idle" && (
                <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "radial-gradient(ellipse at center, hsl(222 44% 8%) 0%, hsl(222 47% 4%) 100%)" }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "hsl(187 100% 52% / 0.08)", border: "2px solid hsl(187 100% 52% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Zap style={{ width: 32, height: 32, color: C }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700, color: "hsl(190 80% 96%)", marginBottom: 6 }}>AI Output</p>
                    <p style={{ fontSize: 13, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>Enable camera and click Stream Now</p>
                  </div>
                </div>
              )}

              {isFullscreen && (
                <button onClick={() => { if (isStreaming) teardownStream(); setIsFullscreen(false); }} style={{ position: "absolute", top: 12, left: 12, zIndex: 20, width: 34, height: 34, borderRadius: "50%", background: "rgba(220,38,38,0.8)", border: "1px solid rgba(255,100,100,0.4)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}

              {!isFullscreen && (
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 20, display: "flex", gap: 6 }}>
                  <div style={{ position: "relative" }}>
                    <button onClick={isObsModeActive ? closePopout : openObsMode} style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", borderRadius: 20, background: isObsModeActive ? "rgba(0,210,211,0.9)" : "rgba(0,0,0,0.6)", color: "#fff", border: isObsModeActive ? "1px solid rgba(0,210,211,0.6)" : "1px solid rgba(255,255,255,0.2)", fontSize: 10, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1, cursor: "pointer", boxShadow: isObsModeActive ? "0 0 12px rgba(0,210,211,0.4)" : "none" }}>
                      <Monitor style={{ width: 11, height: 11 }} /> OBS
                    </button>
                    {obsInstructions && (
                      <div style={{ position: "absolute", top: 36, right: 0, width: 240, background: "hsl(222 44% 7%)", border: "1px solid rgba(0,210,211,0.3)", borderRadius: 12, padding: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 30 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C, fontFamily: "monospace", letterSpacing: 1 }}>● OBS CONNECTED</span>
                          <button onClick={() => setObsInstructions(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>×</button>
                        </div>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>Clean window open. In OBS → Sources → + → Window Capture → Stream Studio.</p>
                      </div>
                    )}
                  </div>
                  <button onClick={isPopoutOpen && !isObsModeActive ? closePopout : openPopout} style={{ width: 30, height: 30, borderRadius: "50%", background: isPopoutOpen && !isObsModeActive ? "rgba(0,210,211,0.85)" : "rgba(0,0,0,0.6)", border: isPopoutOpen && !isObsModeActive ? "1px solid rgba(0,210,211,0.5)" : "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Monitor style={{ width: 13, height: 13 }} />
                  </button>
                  <button onClick={() => setIsFullscreen(v => !v)} title="Fullscreen (F)" style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Maximize2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              )}

              {!isFullscreen && (
                <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 10, width: "22%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", background: "#000", boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  {!cameraReady && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(0,0,0,0.85)" }}>
                      <Camera style={{ width: 18, height: 18, color: "hsl(222 25% 50%)" }} />
                      <button onClick={() => startCamera()} style={{ fontSize: 10, color: C, fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Enable Camera</button>
                    </div>
                  )}
                  <div style={{ position: "absolute", bottom: 3, left: 4, right: 4, background: "rgba(0,0,0,0.7)", borderRadius: 4, fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace", padding: "1px 4px", letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    INPUT{cameras.length && selectedCameraId ? ` · ${cameras.find(c => c.deviceId === selectedCameraId)?.label || "Camera"}` : ""}
                  </div>
                </div>
              )}
            </div>

            {/* Camera selector */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "hsl(187 100% 52% / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Camera style={{ width: 15, height: 15, color: C }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(190 80% 96%)", fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>Camera Source</p>
                  <span style={{ fontSize: 10, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>{cameras.length} detected</span>
                </div>
                {cameras.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", flex: 1 }}>No cameras found. Enable webcam and scan.</p>
                    <button onClick={enumerateCameras} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}><RefreshCw style={{ width: 11, height: 11 }} /> Scan</button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <select value={selectedCameraId} onChange={e => handleCameraSwitch(e.target.value)} disabled={isStreaming} style={{ width: "100%", appearance: "none", padding: "8px 32px 8px 12px", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", borderRadius: 8, color: "hsl(190 80% 96%)", fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer", opacity: isStreaming ? 0.5 : 1 }}>
                      {cameras.map((cam, i) => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>)}
                    </select>
                    <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 50%)", pointerEvents: "none" }} />
                  </div>
                )}
              </div>
              <button onClick={enumerateCameras} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 50%)", padding: 4 }}><RefreshCw style={{ width: 13, height: 13 }} /></button>
            </div>

            {/* Start / Stop */}
            {isStreaming ? (
              <button onClick={handleStopStream} style={{ width: "100%", height: 54, background: "hsl(0 85% 40% / 0.3)", border: "1px solid hsl(0 85% 55% / 0.5)", borderRadius: 12, cursor: "pointer", color: "hsl(0 85% 75%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.5)"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.3)"; }}>
                <Square style={{ width: 18, height: 18 }} /> Stop Stream
              </button>
            ) : (
              <button onClick={handleStartStream} disabled={isStarting || !cameraReady} style={{ width: "100%", height: 54, background: !isStarting && cameraReady ? "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)" : "hsl(222 40% 11%)", border: "none", borderRadius: 12, cursor: !isStarting && cameraReady ? "pointer" : "not-allowed", color: !isStarting && cameraReady ? "hsl(222 47% 4%)" : "hsl(222 25% 40%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: !isStarting && cameraReady ? "0 0 28px hsl(187 100% 52% / 0.3)" : "none", transition: "all 0.2s" }}
                onMouseEnter={e => { if (!isStarting && cameraReady) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}>
                {isStarting ? <><Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Starting…</> : !cameraReady ? <><Camera style={{ width: 18, height: 18 }} /> Enable Camera First</> : <><Play style={{ width: 18, height: 18 }} /> Stream Now</>}
              </button>
            )}

            {/* OBS guide */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Monitor style={{ width: 14, height: 14, color: C }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "hsl(190 80% 96%)", fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>OBS Setup</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[["1","Start your stream here first, enable Audio Sync"],["2","Click OBS → Sources → + → Window Capture → Stream Studio"],["3","No separate mic needed — app handles all audio routing"]].map(([n, text]) => (
                  <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, background: "hsl(187 100% 52% / 0.15)", color: C, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
                    <p style={{ fontSize: 12, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Style presets */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 12 }}>AI Style Preset</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {STYLES.map(s => (
                  <button key={s.id} onClick={() => setSelectedStyle(s.id)} style={{ padding: "7px 4px", borderRadius: 8, cursor: "pointer", background: selectedStyle === s.id ? `${s.color}22` : "hsl(222 40% 8%)", border: `1px solid ${selectedStyle === s.id ? s.color + "66" : "hsl(222 40% 12%)"}`, color: selectedStyle === s.id ? s.color : "hsl(222 25% 55%)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'Orbitron',monospace", transition: "all 0.15s", boxShadow: selectedStyle === s.id ? `0 0 12px ${s.color}33` : "none" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>Custom Prompt</p>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder={style.prompt} rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", color: "hsl(190 80% 96%)", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5, outline: "none" }}
                onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }} onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
              {customPrompt && <button onClick={() => setCustomPrompt("")} style={{ marginTop: 6, fontSize: 11, color: "hsl(222 25% 50%)", background: "none", border: "none", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↺ Reset to preset</button>}
            </div>

            {/* Audio sync */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace" }}>Audio Sync</p>
                <button onClick={handleAudioToggle} style={{ padding: "4px 10px", borderRadius: 20, cursor: "pointer", background: audioEnabled ? "hsl(187 100% 52% / 0.15)" : "hsl(222 40% 9%)", border: `1px solid ${audioEnabled ? "hsl(187 100% 52% / 0.4)" : "hsl(222 40% 14%)"}`, color: audioEnabled ? C : "hsl(222 25% 50%)", fontSize: 10, fontWeight: 700, fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>
                  {audioEnabled ? "ON" : "OFF"}
                </button>
              </div>
              {audioEnabled ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Mic style={{ width: 11, height: 11, color: C }} />
                      <span style={{ fontSize: 11, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Mic Level</span>
                    </div>
                    <div style={{ height: 6, background: "hsl(222 40% 11%)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width 0.05s", width: `${vuLevel}%`, background: vuLevel > 80 ? "hsl(0 85% 55%)" : vuLevel > 50 ? "hsl(40 100% 55%)" : C }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Delay</span>
                      <span style={{ fontSize: 11, color: C, fontFamily: "'Orbitron',monospace", fontWeight: 700 }}>{audioDelay.toFixed(1)}s</span>
                    </div>
                    <input type="range" min={0.1} max={4.0} step={0.1} value={audioDelay} onChange={e => setAudioDelay(Number(e.target.value))} style={{ width: "100%", accentColor: C, cursor: "pointer" }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Volume</span>
                      <span style={{ fontSize: 11, color: C, fontFamily: "'Orbitron',monospace", fontWeight: 700 }}>{Math.round(micVolume * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={2.0} step={0.05} value={micVolume} onChange={e => setMicVolume(Number(e.target.value))} style={{ width: "100%", accentColor: C, cursor: "pointer" }} />
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "hsl(222 25% 45%)", fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5 }}>Enable to sync mic audio with AI video processing — essential for OBS.</p>
              )}
            </div>

            {/* Reference image */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 10 }}>Reference Image</p>
              {refImagePreview ? (
                <div style={{ position: "relative" }}>
                  <img src={refImagePreview} alt="Ref" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, border: "1px solid hsl(187 100% 52% / 0.3)" }} />
                  <button onClick={() => { setRefImagePreview(null); setRefImageB64(null); }} style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(220,38,38,0.8)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X style={{ width: 10, height: 10 }} /></button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 12px", borderRadius: 10, cursor: "pointer", background: "hsl(222 40% 8%)", border: "1px dashed hsl(222 40% 16%)", transition: "all 0.2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(187 100% 52% / 0.4)"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(222 40% 16%)"; }}>
                  <Image style={{ width: 22, height: 22, color: "hsl(222 25% 40%)" }} />
                  <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", textAlign: "center" }}>Upload a face reference to guide the AI</p>
                  <input type="file" accept="image/*" onChange={handleRefImageUpload} style={{ display: "none" }} />
                </label>
              )}
            </div>

            {/* Shortcuts */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "hsl(222 25% 40%)", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 10 }}>Shortcuts</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[["F","Fullscreen + OBS popout"],["Esc","Stop stream & close windows"]].map(([key, desc]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <kbd style={{ padding: "2px 7px", borderRadius: 5, background: "hsl(222 40% 9%)", border: "1px solid hsl(222 40% 16%)", color: "hsl(190 80% 90%)", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{key}</kbd>
                    <span style={{ fontSize: 11, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }`}</style>
    </AppLayout>
  );
}
