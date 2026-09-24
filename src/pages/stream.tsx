import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout";
import { useToast } from "../hooks/use-toast";
import { getApiKey, hasCredentials } from "../lib/credentials";
import { sessionStart, sessionTick, sessionEnd } from "../lib/session-store";
import {
  Zap, Square, Play, Camera, Monitor, Maximize2,
  RefreshCw, ChevronDown, Image, Loader2, X,
  Settings, Mic, Wifi, WifiOff,
} from "lucide-react";

// ─── Style presets ────────────────────────────────────────────────────────────
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

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

const C = "hsl(187 100% 52%)";

// ─── Audio sync engine ────────────────────────────────────────────────────────
const WINDOW_MS = 60;
const BUF_SECS  = 6;
const BUF_LEN   = Math.round((BUF_SECS * 1000) / WINDOW_MS);
const MAX_DELAY = 4.0;
const MIN_DELAY = 0.2;

class AutoSyncEngine {
  private audioCtx:   AudioContext | null = null;
  private analyser:   AnalyserNode  | null = null;
  private delayNode:  DelayNode     | null = null;
  private gainNode:   GainNode      | null = null;
  private dest:       MediaStreamAudioDestinationNode | null = null;
  private freqData:   Uint8Array    = new Uint8Array(0);
  private audioSig:   number[]      = [];
  private videoSig:   number[]      = [];
  private offCanvas:  OffscreenCanvas | null = null;
  private offCtx:     OffscreenCanvasRenderingContext2D | null = null;
  private prevPixels: Uint8ClampedArray | null = null;
  private timer:      ReturnType<typeof setInterval> | null = null;
  private videoEl:    HTMLVideoElement | null = null;

  detectedDelay = 1.2;
  vuLevel = 0;
  onUpdate?: (delay: number, vu: number) => void;

  async start(videoEl: HTMLVideoElement): Promise<MediaStreamAudioDestinationNode | null> {
    this.videoEl = videoEl;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx  = new AudioContext();
      const src  = ctx.createMediaStreamSource(mic);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      this.freqData  = new Uint8Array(analyser.frequencyBinCount);
      const delay    = ctx.createDelay(MAX_DELAY + 0.5);
      delay.delayTime.value = this.detectedDelay;
      const gain = ctx.createGain(); gain.gain.value = 1.0;
      const dest = ctx.createMediaStreamDestination();
      src.connect(analyser); analyser.connect(delay); delay.connect(gain); gain.connect(dest);
      this.audioCtx = ctx; this.analyser = analyser;
      this.delayNode = delay; this.gainNode = gain; this.dest = dest;
      this.offCanvas = new OffscreenCanvas(80, 45);
      this.offCtx    = this.offCanvas.getContext("2d")!;
      this.timer     = setInterval(() => this._tick(), WINDOW_MS);
      return dest;
    } catch { return null; }
  }

  private _tick() {
    if (!this.analyser || !this.videoEl) return;
    this.analyser.getByteFrequencyData(this.freqData);
    const rms = Math.sqrt(this.freqData.reduce((s, v) => s + v * v, 0) / this.freqData.length) / 128;
    this.vuLevel = Math.min(100, rms * 100);
    let vDelta = 0;
    if (this.offCtx && !this.videoEl.paused && this.videoEl.readyState >= 2) {
      try {
        this.offCtx.drawImage(this.videoEl, 0, 0, 80, 45);
        const frame = this.offCtx.getImageData(0, 0, 80, 45);
        if (this.prevPixels) {
          let sum = 0;
          for (let i = 0; i < frame.data.length; i += 4) {
            sum += Math.abs(frame.data[i] - this.prevPixels[i])
                 + Math.abs(frame.data[i+1] - this.prevPixels[i+1])
                 + Math.abs(frame.data[i+2] - this.prevPixels[i+2]);
          }
          vDelta = sum / (frame.data.length * 0.75 * 255);
        }
        this.prevPixels = new Uint8ClampedArray(frame.data);
      } catch { /* ignore */ }
    }
    this.audioSig.push(rms); this.videoSig.push(vDelta);
    if (this.audioSig.length > BUF_LEN) this.audioSig.shift();
    if (this.videoSig.length > BUF_LEN) this.videoSig.shift();
    if (this.audioSig.length === BUF_LEN && this.audioSig.length % 50 === 0) {
      const maxLag = Math.round((MAX_DELAY * 1000) / WINDOW_MS);
      let bestLag = 0, bestCorr = -Infinity;
      for (let lag = 1; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < BUF_LEN - lag; i++) corr += this.audioSig[i] * this.videoSig[i + lag];
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
      }
      const nd = Math.max(MIN_DELAY, Math.min(MAX_DELAY, bestLag * WINDOW_MS / 1000));
      this.detectedDelay = 0.8 * this.detectedDelay + 0.2 * nd;
      if (this.delayNode) this.delayNode.delayTime.value = this.detectedDelay;
    }
    this.onUpdate?.(this.detectedDelay, this.vuLevel);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    this.dest = null; this.delayNode = null; this.gainNode = null;
    this.analyser = null; this.audioSig = []; this.videoSig = []; this.prevPixels = null;
  }
}

// ─── fal.ai Lucy 2.5 WebRTC engine ───────────────────────────────────────────
//
// Raw WebSocket + RTCPeerConnection — NO fal SDK in the signaling path.
// The fal SDK's realtime.connect() filters messages through isSuccessfulResult()
// which blocks Lucy's signaling frames (ready/answer/icecandidate) from reaching
// our code. We use the SDK only to mint the JWT token via IPC, then open a plain
// WebSocket directly to wss://fal.run/<appId>?fal_jwt_token=<token>.
//
// Signaling protocol (Lucy 2.5 / fal WMA):
//   Server → client: { type:"ready" } or { type:"iceservers", iceServers:[...] }
//   Server → client: { type:"answer", sdp:"..." }
//   Both ways:       { type:"icecandidate", candidate:{...} }
//   Client → server: { prompt:"...", reference_image_url:"..." }

interface FalSession {
  close(): void;
  send(input: Record<string, unknown>): void;
}

const FAL_APP_ID = "decart/lucy-2-5/realtime";
const FAL_TOKEN_URL = "https://rest.fal.ai/tokens/";
const FAL_WS_URL = `wss://fal.run/${FAL_APP_ID}`;

async function getFalToken(apiKey: string): Promise<string> {
  // Use Electron IPC if available (key stays in Main Process)
  const api = (window as unknown as { electronAPI?: { getFalToken?: (k: string, a: string) => Promise<string> } }).electronAPI;
  if (api?.getFalToken) return api.getFalToken(apiKey, FAL_APP_ID);
  // Fallback direct fetch (dev / browser context)
  const rawKey = apiKey.startsWith("Key ") ? apiKey.slice(4).trim() : apiKey.trim();
  const res = await fetch(FAL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Key ${rawKey}` },
    body: JSON.stringify({ allowed_apps: [FAL_APP_ID], token_expiration: 60 }),
  });
  if (!res.ok) throw new Error(`fal.ai token failed (${res.status}): ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return typeof data === "string" ? data : (data.detail ?? JSON.stringify(data));
}

async function startFalSession(
  apiKey: string,
  localStream: MediaStream,
  onRemoteStream: (s: MediaStream) => void,
  onDisconnect: () => void,
  initialPrompt: string,
  refImageB64: string | null,
): Promise<FalSession> {

  // Step 1: mint JWT
  const token = await getFalToken(apiKey);

  // Step 2: open raw WebSocket — no SDK filtering
  const ws = new WebSocket(`${FAL_WS_URL}?fal_jwt_token=${encodeURIComponent(token)}`);

  return new Promise<FalSession>((resolve, reject) => {
    let pc: RTCPeerConnection | null = null;
    let settled = false;
    const pendingCandidates: RTCIceCandidateInit[] = [];
    let hasRemoteDesc = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error("fal.ai Lucy 2.5: connection timed out (30s)"));
      }
    }, 30_000);

    const sendWs = (msg: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => {
      // WebSocket open — wait for server's "ready" or "iceservers" message
    };

    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(ev.data as string); } catch { return; }

      const type = (msg.type as string | undefined)?.toLowerCase();

      // ── Server ready: create RTCPeerConnection ───────────────────────────
      if ((type === "ready" || type === "iceservers") && !pc) {
        const iceServers = (
          (msg.iceServers ?? msg.ice_servers ?? msg.iceservers) as RTCIceServer[] | undefined
        ) ?? [{ urls: "stun:stun.l.google.com:19302" }];

        pc = new RTCPeerConnection({ iceServers });

        // Add webcam + mic tracks
        localStream.getTracks().forEach(t => pc!.addTrack(t, localStream));

        // Receive AI video
        pc.ontrack = (ev) => {
          const stream = ev.streams[0] ?? new MediaStream([ev.track]);
          onRemoteStream(stream);
        };

        // Trickle our ICE candidates to the server
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sendWs({
              type: "icecandidate",
              candidate: {
                candidate:     ev.candidate.candidate,
                sdpMid:        ev.candidate.sdpMid,
                sdpMLineIndex: ev.candidate.sdpMLineIndex,
              },
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") {
            onDisconnect();
          }
        };

        // Create offer and send it
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWs({ type: "offer", sdp: pc.localDescription!.sdp });
      }

      // ── SDP answer ────────────────────────────────────────────────────────
      else if (type === "answer" && typeof msg.sdp === "string" && pc && !hasRemoteDesc) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
        hasRemoteDesc = true;
        // Flush buffered ICE candidates
        for (const c of pendingCandidates.splice(0)) {
          if (c.candidate) await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        // Resolve — ICE + media continue in background
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          // Send initial prompt
          sendWs({
            prompt: initialPrompt,
            ...(refImageB64 ? { reference_image_url: `data:image/jpeg;base64,${refImageB64}` } : {}),
          });
          resolve({
            close: () => { try { ws.close(); } catch { /* ignore */ } try { pc?.close(); } catch { /* ignore */ } },
            send:  (d) => sendWs(d),
          });
        }
      }

      // ── ICE candidate from server ─────────────────────────────────────────
      else if (type === "icecandidate" && msg.candidate && pc) {
        const c = msg.candidate as RTCIceCandidateInit;
        if (!hasRemoteDesc) { pendingCandidates.push(c); }
        else if (c.candidate) { await pc.addIceCandidate(new RTCIceCandidate(c)); }
      }

      // ── Error from server ─────────────────────────────────────────────────
      else if (type === "error") {
        if (!settled) {
          settled = true; clearTimeout(timeout);
          reject(new Error(`Lucy signaling error: ${msg.message ?? msg.error ?? JSON.stringify(msg)}`));
        }
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true; clearTimeout(timeout);
        reject(new Error("fal.ai WebSocket connection failed"));
      }
    };

    ws.onclose = (ev) => {
      if (!settled) {
        settled = true; clearTimeout(timeout);
        reject(new Error(`fal.ai WebSocket closed before signaling (code ${ev.code})`));
      } else {
        onDisconnect();
      }
    };
  });
}

function sendPromptUpdate(session: FalSession, prompt: string, refImageB64?: string | null) {
  try {
    session.send({ prompt, ...(refImageB64 ? { reference_image_url: `data:image/jpeg;base64,${refImageB64}` } : {}) });
  } catch { /* ignore */ }
}

// ─── Popup helpers ────────────────────────────────────────────────────────────
function getBaseUrl() { return window.location.href.split("#")[0]; }
function notifyPopup(w: Window | null) {
  if (w && !w.closed) {
    try { w.postMessage({ type: "stream-studio-stream" }, "*"); } catch { /* ignore */ }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StreamPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [connectionStatus, setConnectionStatus] = useState<"idle"|"connecting"|"connected"|"error">("idle");
  const [isStreaming, setIsStreaming]   = useState(false);
  const [isStarting, setIsStarting]    = useState(false);
  const [connectionStep, setConnectionStep] = useState<"auth"|"engine"|null>(null);
  const [elapsedSecs, setElapsedSecs]  = useState(0);

  const [cameras, setCameras]               = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraReady, setCameraReady]       = useState(false);

  const [selectedStyle, setSelectedStyle]   = useState<StyleId>("hyper-real");
  const [customPrompt, setCustomPrompt]     = useState("");

  const [syncDelay, setSyncDelay]   = useState(1.2);
  const [vuLevel, setVuLevel]       = useState(0);
  const [audioActive, setAudioActive] = useState(false);

  const [refImageB64, setRefImageB64]         = useState<string|null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string|null>(null);

  const [isFullscreen, setIsFullscreen]       = useState(false);
  const [isPopoutOpen, setIsPopoutOpen]       = useState(false);
  const [isObsModeActive, setIsObsModeActive] = useState(false);
  const [obsInstructions, setObsInstructions] = useState(false);

  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement>(null);
  const localStreamRef  = useRef<MediaStream|null>(null);
  const falSessionRef   = useRef<FalSession|null>(null);
  const syncEngineRef   = useRef<AutoSyncEngine|null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval>|null>(null);
  const popoutRef       = useRef<Window|null>(null);
  const obsWindowRef    = useRef<Window|null>(null);
  const remoteStreamRef = useRef<MediaStream|null>(null);
  const isStartingRef   = useRef(false);

  const credsMissing = !hasCredentials();

  // ─── Camera ──────────────────────────────────────────────────────────────
  const enumerateCameras = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const vids  = devs.filter(d => d.kind === "videoinput");
      setCameras(vids);
      if (vids.length && !selectedCameraId) setSelectedCameraId(vids[0].deviceId);
    } catch { /* ignore */ }
  }, [selectedCameraId]);

  useEffect(() => { enumerateCameras(); }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    const id = deviceId ?? selectedCameraId;
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCameraReady(true);
      enumerateCameras();
    } catch {
      toast({ title: "Camera Error", description: "Could not access your camera.", variant: "destructive" });
    }
  }, [selectedCameraId, enumerateCameras, toast]);

  const handleCameraSwitch = useCallback(async (id: string) => {
    setSelectedCameraId(id);
    if (cameraReady) await startCamera(id);
  }, [cameraReady, startCamera]);

  // ─── Teardown ─────────────────────────────────────────────────────────────
  const teardownStream = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isStartingRef.current = false;
    if (falSessionRef.current) { falSessionRef.current.close(); falSessionRef.current = null; }
    syncEngineRef.current?.stop(); syncEngineRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    window.__ssRemoteStream = null;
    if (popoutRef.current && !popoutRef.current.closed) {
      try { popoutRef.current.postMessage("stream-studio-clear", "*"); } catch { /* ignore */ }
    }
    if (obsWindowRef.current && !obsWindowRef.current.closed) {
      try { obsWindowRef.current.postMessage("stream-studio-clear", "*"); } catch { /* ignore */ }
    }
    sessionEnd();
    setIsStreaming(false); setConnectionStatus("idle");
    setConnectionStep(null); setElapsedSecs(0);
    setAudioActive(false); setSyncDelay(1.2); setVuLevel(0);
  }, []);

  // ─── Start stream ─────────────────────────────────────────────────────────
  const handleStartStream = useCallback(async () => {
    if (isStartingRef.current || isStreaming) return;
    if (credsMissing) { setLocation("/settings"); return; }
    if (!cameraReady || !localStreamRef.current) {
      toast({ title: "Camera not ready", description: "Enable your camera first.", variant: "destructive" });
      return;
    }

    const apiKey = getApiKey()!;
    isStartingRef.current = true;
    setIsStarting(true);
    setConnectionStep("auth");
    setConnectionStatus("connecting");

    try {
      setConnectionStep("engine");
      const style  = STYLES.find(s => s.id === selectedStyle)!;
      const prompt = customPrompt.trim() || style.prompt;

      // Start audio sync engine
      const engine = new AutoSyncEngine();
      engine.onUpdate = (delay, vu) => { setSyncDelay(delay); setVuLevel(vu); };
      const audioDest = await engine.start(remoteVideoRef.current!);
      syncEngineRef.current = engine;

      // Build send stream: webcam video + delayed mic audio
      let sendStream = localStreamRef.current;
      if (audioDest) {
        const audioTrack = audioDest.stream.getAudioTracks()[0];
        if (audioTrack) {
          sendStream = new MediaStream([...localStreamRef.current.getVideoTracks(), audioTrack]);
          setAudioActive(true);
        }
      }

      // Connect to fal.ai Lucy 2.5
      const session = await startFalSession(
        apiKey,
        sendStream,
        (remote) => {
          remoteStreamRef.current = remote;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
          window.__ssRemoteStream = remote;
          notifyPopup(popoutRef.current);
          notifyPopup(obsWindowRef.current);
          setConnectionStatus("connected");
        },
        () => {
          teardownStream();
          toast({ title: "Stream disconnected", description: "Connection lost. Try again.", variant: "destructive" });
        },
        prompt,
        refImageB64,
      );

      falSessionRef.current = session;
      sessionStart();
      const t0 = Date.now();
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setElapsedSecs(s); sessionTick(s);
      }, 1000);
      setIsStreaming(true);

    } catch (err) {
      teardownStream();
      toast({
        title: "Stream Failed",
        description: err instanceof Error ? err.message : "Check your fal.ai API Key in Settings.",
        variant: "destructive",
      });
    } finally {
      isStartingRef.current = false;
      setIsStarting(false);
    }
  }, [isStreaming, credsMissing, cameraReady, selectedStyle, customPrompt, refImageB64, teardownStream, toast]);

  const handleStopStream = useCallback(() => teardownStream(), [teardownStream]);

  // ─── Live prompt updates ──────────────────────────────────────────────────
  const handlePromptChange = useCallback((newPrompt: string) => {
    if (falSessionRef.current && isStreaming) sendPromptUpdate(falSessionRef.current, newPrompt, refImageB64);
  }, [isStreaming, refImageB64]);

  const handleStyleSelect = useCallback((id: StyleId) => {
    setSelectedStyle(id);
    const style  = STYLES.find(s => s.id === id)!;
    handlePromptChange(customPrompt.trim() || style.prompt);
  }, [customPrompt, handlePromptChange]);

  const handleCustomPromptChange = useCallback((val: string) => {
    setCustomPrompt(val);
    if (isStreaming) {
      const style = STYLES.find(s => s.id === selectedStyle)!;
      handlePromptChange(val.trim() || style.prompt);
    }
  }, [isStreaming, selectedStyle, handlePromptChange]);

  // ─── Reference image ──────────────────────────────────────────────────────
  const handleRefImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      const data = ev.target?.result as string;
      const b64  = data.split(",")[1] ?? data;
      setRefImagePreview(data); setRefImageB64(b64);
      if (falSessionRef.current && isStreaming) {
        const style = STYLES.find(s => s.id === selectedStyle)!;
        sendPromptUpdate(falSessionRef.current, customPrompt.trim() || style.prompt, b64);
      }
    };
    r.readAsDataURL(file); e.target.value = "";
  }, [isStreaming, selectedStyle, customPrompt]);

  // ─── Popout windows ───────────────────────────────────────────────────────
  const openPopout = useCallback(() => {
    if (popoutRef.current && !popoutRef.current.closed) { popoutRef.current.focus(); return; }
    const w = window.open(getBaseUrl() + "#/popout", "ss-popout", "width=1280,height=720,menubar=no,toolbar=no,location=no");
    if (!w) return;
    popoutRef.current = w; setIsPopoutOpen(true);
    w.addEventListener("load", () => notifyPopup(w));
    const chk = setInterval(() => { if (w.closed) { clearInterval(chk); setIsPopoutOpen(false); popoutRef.current = null; } }, 1000);
  }, []);

  const openObsWindow = useCallback(() => {
    if (obsWindowRef.current && !obsWindowRef.current.closed) { obsWindowRef.current.focus(); return; }
    const w = window.open(getBaseUrl() + "#/obsout", "ss-obsout", "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
    if (!w) return;
    obsWindowRef.current = w; setIsObsModeActive(true); setObsInstructions(true);
    w.addEventListener("load", () => notifyPopup(w));
    const chk = setInterval(() => { if (w.closed) { clearInterval(chk); setIsObsModeActive(false); setObsInstructions(false); obsWindowRef.current = null; } }, 1000);
  }, []);

  const closeObsWindow = useCallback(() => {
    if (obsWindowRef.current && !obsWindowRef.current.closed) obsWindowRef.current.close();
    obsWindowRef.current = null; setIsObsModeActive(false); setObsInstructions(false);
  }, []);

  const closePopout = useCallback(() => {
    if (popoutRef.current && !popoutRef.current.closed) popoutRef.current.close();
    popoutRef.current = null; setIsPopoutOpen(false);
  }, []);

  const closeAllPopups = useCallback(() => { closePopout(); closeObsWindow(); }, [closePopout, closeObsWindow]);

  // ─── Message listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data === "stream-studio-stop") teardownStream();
      else if (e.data === "stream-studio-reconnect" && cameraReady) { teardownStream(); setTimeout(() => handleStartStream(), 300); }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [teardownStream, cameraReady, handleStartStream]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) { teardownStream(); setIsFullscreen(false); return; }
        closeAllPopups(); if (isStreaming) teardownStream(); return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); setIsFullscreen(v => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStreaming, isFullscreen, teardownStream, closeAllPopups]);

  const style = STYLES.find(s => s.id === selectedStyle)!;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {/* Missing credentials banner */}
      {credsMissing && (
        <div style={{ margin: "16px 32px 0", padding: "12px 18px", borderRadius: 10, background: "hsl(40 100% 52% / 0.1)", border: "1px solid hsl(40 100% 52% / 0.35)", display: "flex", alignItems: "center", gap: 12 }}>
          <Settings style={{ width: 16, height: 16, color: "hsl(40 100% 62%)", flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "hsl(40 100% 75%)", fontFamily: "'Rajdhani',sans-serif", flex: 1 }}>
            <strong>fal.ai API Key not set.</strong> Go to Settings to add it before streaming.
          </p>
          <button onClick={() => setLocation("/settings")} style={{ padding: "6px 14px", borderRadius: 8, background: "hsl(40 100% 52% / 0.25)", border: "1px solid hsl(40 100% 52% / 0.5)", color: "hsl(40 100% 80%)", fontWeight: 700, fontSize: 12, fontFamily: "'Orbitron',monospace", cursor: "pointer", letterSpacing: "0.04em" }}>
            Open Settings
          </button>
        </div>
      )}

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
                {connectionStep === "engine" ? "2/2 · Connecting to fal.ai Lucy 2.5…" : "1/2 · Validating API Key…"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%", padding: "0 8px" }}>
              {["auth","engine"].map((step, i) => {
                const idx = ["auth","engine"].indexOf(connectionStep ?? "auth");
                return <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, transition: "all 0.5s", background: i < idx ? C : i === idx ? "hsl(187 100% 52% / 0.45)" : "hsl(222 40% 14%)" }} />;
              })}
            </div>
            <button onClick={() => teardownStream()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, width: "100%", justifyContent: "center", background: "transparent", border: "1px solid hsl(187 100% 52% / 0.25)", color: "hsl(187 100% 52% / 0.8)", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer" }}>
              <X style={{ width: 14, height: 14 }} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video autoPlay playsInline ref={(el) => { if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: "block" }} />
          <button onClick={() => { teardownStream(); setIsFullscreen(false); }} title="Stop stream & exit fullscreen (Esc)"
            style={{ position: "absolute", top: 16, left: 16, zIndex: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(220,38,38,0.85)", border: "1px solid rgba(255,100,100,0.4)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
          {isStreaming && (
            <div style={{ position: "absolute", top: 16, right: 16, padding: "4px 12px", borderRadius: 20, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: C, fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em" }}>
              {formatTime(elapsedSecs)}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", color: "hsl(190 80% 96%)", marginBottom: 2 }}>Live Stream</h1>
            <p style={{ fontSize: 13, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Real-time AI video transformation · Lucy 2.5 on fal.ai</p>
          </div>
          {isStreaming && connectionStatus === "connected" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: "hsl(0 85% 55% / 0.1)", border: "1px solid hsl(0 85% 55% / 0.2)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(0 85% 65%)", animation: "pulse 2s ease-in-out infinite" }} />
              <span style={{ fontSize: 11, color: "hsl(0 85% 70%)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>LIVE · {formatTime(elapsedSecs)}</span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", gap: 20 }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* AI Output panel */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000",
              boxShadow: connectionStatus === "connected" ? "0 0 40px hsl(187 100% 52% / 0.25), 0 0 0 1px hsl(187 100% 52% / 0.15)" : "0 0 0 1px hsl(222 40% 14%)" }}>
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

              {/* Top-right buttons */}
              <div style={{ position: "absolute", top: 10, right: 10, zIndex: 20, display: "flex", gap: 6 }}>
                <div style={{ position: "relative" }}>
                  <button onClick={isObsModeActive ? closeObsWindow : openObsWindow}
                    style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", borderRadius: 20, background: isObsModeActive ? "rgba(0,210,211,0.9)" : "rgba(0,0,0,0.6)", color: isObsModeActive ? "hsl(222 47% 4%)" : "#fff", border: isObsModeActive ? "1px solid rgba(0,210,211,0.6)" : "1px solid rgba(255,255,255,0.2)", fontSize: 10, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1, cursor: "pointer" }}>
                    <Monitor style={{ width: 11, height: 11 }} /> OBS
                  </button>
                  {obsInstructions && (
                    <div style={{ position: "absolute", top: 36, right: 0, width: 240, background: "hsl(222 44% 7%)", border: "1px solid rgba(0,210,211,0.3)", borderRadius: 12, padding: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 30 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C, fontFamily: "monospace", letterSpacing: 1 }}>● OBS WINDOW OPEN</span>
                        <button onClick={() => setObsInstructions(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>×</button>
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>In OBS → Sources → + → Window Capture → select "Stream Studio OBS".</p>
                    </div>
                  )}
                </div>
                <button onClick={isPopoutOpen ? closePopout : openPopout}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: isPopoutOpen ? "rgba(0,210,211,0.85)" : "rgba(0,0,0,0.6)", border: isPopoutOpen ? "1px solid rgba(0,210,211,0.5)" : "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Monitor style={{ width: 13, height: 13 }} />
                </button>
                <button onClick={() => setIsFullscreen(v => !v)} title="Fullscreen (F)"
                  style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Maximize2 style={{ width: 13, height: 13 }} />
                </button>
              </div>

              {/* PiP camera */}
              <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 10, width: "22%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", background: "#000" }}>
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                {!cameraReady && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(0,0,0,0.85)" }}>
                    <Camera style={{ width: 18, height: 18, color: "hsl(222 25% 50%)" }} />
                    <button onClick={() => startCamera()} style={{ fontSize: 10, color: C, fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Enable Camera</button>
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 3, left: 4, right: 4, background: "rgba(0,0,0,0.7)", borderRadius: 4, fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace", padding: "1px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  INPUT{cameras.length && selectedCameraId ? ` · ${cameras.find(c => c.deviceId === selectedCameraId)?.label || "Camera"}` : ""}
                </div>
              </div>
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
                    <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", flex: 1 }}>No cameras found.</p>
                    <button onClick={enumerateCameras} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}><RefreshCw style={{ width: 11, height: 11 }} /> Scan</button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <select value={selectedCameraId} onChange={e => handleCameraSwitch(e.target.value)} disabled={isStreaming}
                      style={{ width: "100%", appearance: "none", padding: "8px 32px 8px 12px", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", borderRadius: 8, color: "hsl(190 80% 96%)", fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer", opacity: isStreaming ? 0.5 : 1 }}>
                      {cameras.map((cam, i) => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>)}
                    </select>
                    <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 50%)", pointerEvents: "none" }} />
                  </div>
                )}
              </div>
              <button onClick={enumerateCameras} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 50%)", padding: 4 }}><RefreshCw style={{ width: 13, height: 13 }} /></button>
            </div>

            {/* Stream button */}
            {isStreaming ? (
              <button onClick={handleStopStream}
                style={{ width: "100%", height: 54, background: "hsl(0 85% 40% / 0.3)", border: "1px solid hsl(0 85% 55% / 0.5)", borderRadius: 12, cursor: "pointer", color: "hsl(0 85% 75%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.5)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.3)"; }}>
                <Square style={{ width: 18, height: 18 }} /> Stop Stream
              </button>
            ) : (
              <button onClick={handleStartStream} disabled={isStarting || !cameraReady}
                style={{ width: "100%", height: 54, background: (!isStarting && cameraReady && !credsMissing) ? "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)" : "hsl(222 40% 11%)", border: "none", borderRadius: 12, cursor: (!isStarting && cameraReady && !credsMissing) ? "pointer" : "not-allowed", color: (!isStarting && cameraReady && !credsMissing) ? "hsl(222 47% 4%)" : "hsl(222 25% 40%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: (!isStarting && cameraReady && !credsMissing) ? "0 0 28px hsl(187 100% 52% / 0.3)" : "none" }}
                onMouseEnter={e => { if (!isStarting && cameraReady && !credsMissing) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}>
                {isStarting ? <><Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Starting…</>
                  : credsMissing ? <><Settings style={{ width: 18, height: 18 }} /> Open Settings to Set Key</>
                  : !cameraReady ? <><Camera style={{ width: 18, height: 18 }} /> Enable Camera First</>
                  : <><Play style={{ width: 18, height: 18 }} /> Stream Now</>}
              </button>
            )}

            {/* OBS guide */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Monitor style={{ width: 14, height: 14, color: C }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "hsl(190 80% 96%)", fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>OBS Setup</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[["1","Start your stream here first — audio sync is automatic"],["2","Click OBS above the video to open a clean output window"],["3","In OBS: Sources → + → Window Capture → select the OBS window"],["4","No separate mic needed — audio is pre-synced automatically"]].map(([n, text]) => (
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
                  <button key={s.id} onClick={() => handleStyleSelect(s.id)}
                    style={{ padding: "7px 4px", borderRadius: 8, cursor: "pointer", background: selectedStyle === s.id ? `${s.color}22` : "hsl(222 40% 8%)", border: `1px solid ${selectedStyle === s.id ? s.color + "66" : "hsl(222 40% 12%)"}`, color: selectedStyle === s.id ? s.color : "hsl(222 25% 55%)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'Orbitron',monospace", boxShadow: selectedStyle === s.id ? `0 0 12px ${s.color}33` : "none" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>Custom Prompt</p>
              <textarea value={customPrompt} onChange={e => handleCustomPromptChange(e.target.value)} placeholder={style.prompt} rows={3}
                style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", color: "hsl(190 80% 96%)", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5, outline: "none" }}
                onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }}
                onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
              {customPrompt && (
                <button onClick={() => handleCustomPromptChange("")} style={{ marginTop: 6, fontSize: 11, color: "hsl(222 25% 50%)", background: "none", border: "none", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
                  ↺ Reset to preset
                </button>
              )}
            </div>

            {/* Audio Sync */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace" }}>Audio Sync</p>
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: audioActive ? "hsl(187 100% 52% / 0.12)" : "hsl(222 40% 9%)", border: `1px solid ${audioActive ? "hsl(187 100% 52% / 0.35)" : "hsl(222 40% 14%)"}` }}>
                  {audioActive ? <Wifi style={{ width: 10, height: 10, color: C }} /> : <WifiOff style={{ width: 10, height: 10, color: "hsl(222 25% 40%)" }} />}
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em", color: audioActive ? C : "hsl(222 25% 40%)" }}>{audioActive ? "AUTO" : "IDLE"}</span>
                </div>
              </div>
              {audioActive ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <Mic style={{ width: 11, height: 11, color: C }} />
                      <span style={{ fontSize: 11, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Microphone</span>
                    </div>
                    <div style={{ height: 6, background: "hsl(222 40% 11%)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width 0.05s", width: `${vuLevel}%`, background: vuLevel > 80 ? "hsl(0 85% 55%)" : vuLevel > 50 ? "hsl(40 100% 55%)" : C }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "hsl(222 40% 8%)", border: "1px solid hsl(222 40% 12%)" }}>
                    <span style={{ fontSize: 12, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Detected Delay</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C, fontFamily: "'Orbitron',monospace" }}>{syncDelay.toFixed(2)}s</span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "hsl(222 25% 45%)", fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5 }}>
                  When you click <strong style={{ color: "hsl(190 80% 80%)" }}>Stream Now</strong>, your mic is detected and audio delay is calibrated automatically.
                </p>
              )}
            </div>

            {/* Reference image */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 10 }}>Reference Image</p>
              {refImagePreview ? (
                <div style={{ position: "relative" }}>
                  <img src={refImagePreview} alt="Ref" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, border: "1px solid hsl(187 100% 52% / 0.3)" }} />
                  <button onClick={() => { setRefImagePreview(null); setRefImageB64(null); }} style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(220,38,38,0.8)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 12px", borderRadius: 10, cursor: "pointer", background: "hsl(222 40% 8%)", border: "1px dashed hsl(222 40% 16%)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(187 100% 52% / 0.4)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(222 40% 16%)"; }}>
                  <Image style={{ width: 22, height: 22, color: "hsl(222 25% 40%)" }} />
                  <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", textAlign: "center" }}>Upload a face reference to guide the AI</p>
                  <input type="file" accept="image/*" onChange={handleRefImage} style={{ display: "none" }} />
                </label>
              )}
            </div>

            {/* Shortcuts */}
            <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "hsl(222 25% 40%)", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 10 }}>Shortcuts</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[["F","Fullscreen AI output"],["Esc","Stop stream & exit"]].map(([key, desc]) => (
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

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </AppLayout>
  );
}
