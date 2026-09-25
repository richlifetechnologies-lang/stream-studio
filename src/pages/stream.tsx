import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "../components/layout";
import { useToast } from "../hooks/use-toast";
import {
  getApiKey, hasCredentials, getVoiceKey, hasVoiceKey,
  getSavedVoices, addSavedVoice, removeSavedVoice, type SavedVoice,
} from "../lib/credentials";
import { sessionStart, sessionTick, sessionEnd } from "../lib/session-store";
import {
  Zap, Square, Play, Camera, Monitor, Maximize2, RefreshCw,
  ChevronDown, Image, Loader2, X, Settings, Mic, Wifi, WifiOff,
  Volume2, Upload, Trash2, Video, Headphones, VideoIcon, Smartphone,
} from "lucide-react";
import { encode, decode } from "@msgpack/msgpack";

// ─── Branding ─────────────────────────────────────────────────────────────────
const APP = "Stream Studio";

// ─── Tab definitions ──────────────────────────────────────────────────────────
type TabId = "video-audio" | "audio-only" | "video-only";
const TABS: { id: TabId; label: string; sub: string; Icon: typeof Video }[] = [
  { id: "video-audio", label: "Video + Audio",  sub: "AI video with voice cloning", Icon: VideoIcon },
  { id: "audio-only",  label: "Audio Call",     sub: "Voice cloning only",          Icon: Headphones },
  { id: "video-only",  label: "Video Call",     sub: "AI video, natural voice",     Icon: Video },
];

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

// ─── Built-in voices ──────────────────────────────────────────────────────────
const BUILTIN_VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George — warm male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam — articulate male" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte — seductive female" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice — confident female" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily — warm female" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian — deep male" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum — intense male" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris — casual male" },
];

const C  = "hsl(187 100% 52%)";
const VC = "hsl(265 90% 65%)";

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ─── Audio sync pipeline ──────────────────────────────────────────────────────
// Captures the selected mic, applies a cross-correlation delay to match
// AI video output latency, and returns a delayed audio destination node.

const WINDOW_MS = 60;
const BUF_SECS  = 6;
const BUF_LEN   = Math.round((BUF_SECS * 1000) / WINDOW_MS);
const MAX_DELAY = 4.0;
const MIN_DELAY = 0.0;

class AudioSyncPipeline {
  private audioCtx:   AudioContext | null = null;
  private analyser:   AnalyserNode  | null = null;
  private delayNode:  DelayNode     | null = null;
  private dest:       MediaStreamAudioDestinationNode | null = null;
  private freqData:   Uint8Array    = new Uint8Array(0);
  private audioSig:   number[]      = [];
  private videoSig:   number[]      = [];
  private offCanvas:  OffscreenCanvas | null = null;
  private offCtx:     OffscreenCanvasRenderingContext2D | null = null;
  private prevPixels: Uint8ClampedArray | null = null;
  private timer:      ReturnType<typeof setInterval> | null = null;
  private videoEl:    HTMLVideoElement | null = null;
  private micStream:  MediaStream | null = null;

  detectedDelay = 0.8;
  vuLevel = 0;
  onUpdate?: (delay: number, vu: number) => void;

  async start(videoEl: HTMLVideoElement, micDeviceId?: string): Promise<MediaStreamAudioDestinationNode | null> {
    this.videoEl = videoEl;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId
          ? { deviceId: { exact: micDeviceId }, echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }
          : { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
        video: false,
      });
      const ctx = new AudioContext({ sampleRate: 48000 });
      const src = ctx.createMediaStreamSource(this.micStream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      const delay = ctx.createDelay(MAX_DELAY + 0.5); delay.delayTime.value = this.detectedDelay;
      const gain = ctx.createGain(); gain.gain.value = 1.0;
      const dest = ctx.createMediaStreamDestination();
      src.connect(analyser); analyser.connect(delay); delay.connect(gain); gain.connect(dest);
      this.audioCtx = ctx; this.analyser = analyser; this.delayNode = delay; this.dest = dest;
      this.offCanvas = new OffscreenCanvas(80, 45);
      this.offCtx = this.offCanvas.getContext("2d")!;
      this.timer = setInterval(() => this._tick(), WINDOW_MS);
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
      this.detectedDelay = 0.85 * this.detectedDelay + 0.15 * nd;
      if (this.delayNode) this.delayNode.delayTime.value = this.detectedDelay;
    }
    this.onUpdate?.(this.detectedDelay, this.vuLevel);
  }

  getMicStream() { return this.micStream; }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    this.micStream?.getTracks().forEach(t => t.stop()); this.micStream = null;
    this.dest = null; this.delayNode = null; this.analyser = null;
    this.audioSig = []; this.videoSig = []; this.prevPixels = null;
  }
}

// ─── Voice cloning engine ─────────────────────────────────────────────────────
// Records mic in 2-second chunks, transforms each chunk via the voice API,
// plays the result back delayed to match video output.

class VoiceCloningEngine {
  private recorder:   MediaRecorder | null = null;
  private audioCtx:   AudioContext  | null = null;
  private nextPlayAt = 0;
  private running    = false;
  private videoDelay = 0.8;
  private analyserCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;

  apiKey  = "";
  voiceId = BUILTIN_VOICES[0].id;
  onVu?:   (level: number) => void;
  onError?: (msg: string) => void;

  setVideoDelay(d: number) { this.videoDelay = d; }

  async start(micStream: MediaStream) {
    if (this.running) return;
    this.running  = true;
    this.audioCtx = new AudioContext();
    this.nextPlayAt = this.audioCtx.currentTime + this.videoDelay + 0.1;

    // Analyser for waveform — uses the same mic stream
    this.analyserCtx = new AudioContext();
    const src = this.analyserCtx.createMediaStreamSource(micStream);
    this.analyserNode = this.analyserCtx.createAnalyser();
    this.analyserNode.fftSize = 256;
    src.connect(this.analyserNode);

    const chunkMs = 2000;
    const chunks: Blob[] = [];
    this.recorder = new MediaRecorder(micStream, { mimeType: "audio/webm;codecs=opus" });

    this.recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
    this.recorder.onstop = async () => {
      if (!this.running) return;
      const blob = new Blob(chunks.splice(0), { type: "audio/webm" });
      void this._process(blob);
      if (this.running) {
        this.recorder!.start(chunkMs);
        setTimeout(() => { if (this.running && this.recorder?.state === "recording") this.recorder.requestData(); }, chunkMs);
      }
    };
    this.recorder.start(chunkMs);
    setTimeout(() => { if (this.running && this.recorder?.state === "recording") this.recorder.requestData(); }, chunkMs);
  }

  private async _process(blob: Blob) {
    if (!this.running || !this.audioCtx || !this.apiKey || !this.voiceId) return;
    try {
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");
      form.append("model_id", "eleven_multilingual_sts_v2");
      form.append("voice_settings", JSON.stringify({ stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }));
      const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${this.voiceId}/stream`, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey },
        body: form,
      });
      if (!res.ok) { this.onError?.(`Voice engine error ${res.status}`); return; }
      const buf = await res.arrayBuffer();
      if (!this.running || !this.audioCtx) return;
      const decoded = await this.audioCtx.decodeAudioData(buf);
      const playAt = Math.max(this.audioCtx.currentTime + this.videoDelay, this.nextPlayAt);
      const src = this.audioCtx.createBufferSource();
      src.buffer = decoded; src.connect(this.audioCtx.destination); src.start(playAt);
      this.nextPlayAt = playAt + decoded.duration;
      const data = decoded.getChannelData(0);
      let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      this.onVu?.(Math.min(100, Math.sqrt(sum / data.length) * 300));
    } catch (e) {
      if (this.running) this.onError?.(e instanceof Error ? e.message : "Voice processing error");
    }
  }

  getAnalyser(): AnalyserNode | null { return this.analyserNode; }

  stop() {
    this.running = false;
    try { this.recorder?.stop(); } catch { /* ignore */ }
    this.recorder = null;
    try { this.audioCtx?.close(); } catch { /* ignore */ }
    try { this.analyserCtx?.close(); } catch { /* ignore */ }
    this.audioCtx = null; this.analyserCtx = null; this.analyserNode = null;
  }
}

// ─── Waveform canvas component ────────────────────────────────────────────────
function Waveform({ analyser, color = C, height = 80 }: { analyser: AnalyserNode | null; color?: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "hsl(222 47% 5%)";
      ctx.fillRect(0, 0, W, H);

      if (!analyser) {
        // idle flat line
        ctx.strokeStyle = "hsl(222 40% 20%)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        return;
      }

      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const step = W / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const y = ((buf[i] / 128) - 1) * (H / 2 - 8) + H / 2;
        i === 0 ? ctx.moveTo(i * step, y) : ctx.lineTo(i * step, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [analyser, color]);

  return (
    <canvas ref={canvasRef} width={600} height={height}
      style={{ width: "100%", height, borderRadius: 8, display: "block", background: "hsl(222 47% 5%)", border: "1px solid hsl(222 40% 12%)" }} />
  );
}

// ─── Voice upload helper ──────────────────────────────────────────────────────
async function uploadVoice(apiKey: string, name: string, file: File): Promise<SavedVoice> {
  const form = new FormData();
  form.append("name", name);
  form.append("files", file);
  form.append("description", `Uploaded via ${APP}`);
  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`Voice upload failed (${res.status})`);
  const data = await res.json() as { voice_id: string };
  return { id: data.voice_id, name, createdAt: Date.now() };
}

// ─── Video engine (proven — DO NOT MODIFY) ───────────────────────────────────
const _RELAY_APP   = "decart/lucy-2-5/realtime";
const _RELAY_WS    = `wss://fal.run/${_RELAY_APP}`;
const _TOKEN_URL   = "https://rest.fal.ai/tokens/";
const _TOKEN_ALIAS = "lucy-2-5";

interface VideoSession { close(): void; send(d: Record<string, unknown>): void; }

async function _mintToken(apiKey: string): Promise<string> {
  const api = (window as unknown as { electronAPI?: { getFalToken?: (k: string, a: string) => Promise<string> } }).electronAPI;
  if (api?.getFalToken) return api.getFalToken(apiKey, _TOKEN_ALIAS);
  const rawKey = apiKey.startsWith("Key ") ? apiKey.slice(4).trim() : apiKey.trim();
  const res = await fetch(_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Key ${rawKey}` }, body: JSON.stringify({ allowed_apps: [_TOKEN_ALIAS], token_expiration: 120 }) });
  if (!res.ok) throw new Error(`Engine connection failed (${res.status})`);
  const raw = await res.text();
  try { const p = JSON.parse(raw); if (typeof p === "string") return p; if (p?.detail) return p.detail; if (p?.token) return p.token; } catch { /* plain text */ }
  return raw.replace(/^"|"$/g, "").trim();
}

async function _startVideoSession(apiKey: string, localStream: MediaStream, onRemote: (s: MediaStream) => void, onDisconnect: () => void, prompt: string, refB64: string | null): Promise<VideoSession> {
  const token = await _mintToken(apiKey);
  const ws = new WebSocket(`${_RELAY_WS}?fal_jwt_token=${encodeURIComponent(token)}&max_buffering=8`);
  ws.binaryType = "arraybuffer";
  const send = (o: Record<string, unknown>) => { if (ws.readyState === WebSocket.OPEN) ws.send(encode(o)); };
  const pp: Record<string, unknown> = { prompt };
  if (refB64) pp.reference_image_url = `data:image/jpeg;base64,${refB64}`;
  return new Promise<VideoSession>((resolve, reject) => {
    let pc: RTCPeerConnection | null = null;
    let settled = false;
    const buf: RTCIceCandidateInit[] = [];
    let hasAnswer = false;
    const to = setTimeout(() => { if (!settled) { settled = true; reject(new Error(`${APP}: connection timed out`)); } }, 30_000);
    ws.onopen = () => { send(pp); };
    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try { const d = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ev.data; msg = decode(d) as Record<string, unknown>; } catch { return; }
      const type = (msg.type as string | undefined)?.toLowerCase();
      if ((type === "ready" || type === "iceservers") && !pc) {
        const ice = ((msg.iceServers ?? msg.ice_servers ?? msg.iceservers) as RTCIceServer[] | undefined) ?? [{ urls: "stun:stun.l.google.com:19302" }];
        pc = new RTCPeerConnection({ iceServers: ice });
        localStream.getTracks().forEach(t => pc!.addTrack(t, localStream));
        pc.ontrack = ev => { onRemote(ev.streams[0] ?? new MediaStream([ev.track])); };
        pc.onicecandidate = ev => { if (ev.candidate) send({ type: "candidate", candidate: ev.candidate.toJSON() }); };
        pc.onconnectionstatechange = () => { if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") onDisconnect(); };
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        send({ type: "offer", sdp: pc.localDescription!.sdp, ...pp });
      } else if (type === "answer" && typeof msg.sdp === "string" && pc && !hasAnswer) {
        hasAnswer = true;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
        for (const c of buf.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c));
        if (!settled) { settled = true; clearTimeout(to); resolve({ close: () => { try { ws.close(); } catch { /**/ } try { pc?.close(); } catch { /**/ } }, send: d => send(d) }); }
      } else if ((type === "candidate" || type === "icecandidate") && msg.candidate && pc) {
        const c = msg.candidate as RTCIceCandidateInit;
        if (!hasAnswer) buf.push(c); else if (c.candidate) await pc.addIceCandidate(new RTCIceCandidate(c));
      } else if (type === "error") {
        const detail = msg.message ?? msg.reason ?? msg.error ?? "Unknown error";
        if (!settled) { settled = true; clearTimeout(to); reject(new Error(`${APP} error: ${detail}`)); }
      }
    };
    ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error(`${APP}: connection error`)); } };
    ws.onclose = ev => {
      if (!settled) { settled = true; clearTimeout(to); reject(new Error(`${APP}: connection closed (${ev.code})`)); }
      else if (ev.code !== 1000) onDisconnect();
    };
  });
}

function _updatePrompt(session: VideoSession, prompt: string, refB64?: string | null) {
  try { session.send({ prompt, ...(refB64 ? { reference_image_url: `data:image/jpeg;base64,${refB64}` } : {}) }); } catch { /**/ }
}

function _getBaseUrl() { return window.location.href.split("#")[0]; }
function _notifyPopup(w: Window | null) { if (w && !w.closed) try { w.postMessage({ type: "stream-studio-stream" }, "*"); } catch { /**/ } }

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function StreamPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("video-audio");

  // ── Portrait / Landscape mode (persisted) ──────────────────────────────────
  const [portraitMode, setPortraitMode] = useState<boolean>(() => {
    try { return localStorage.getItem("ss_portrait_mode") === "1"; } catch { return false; }
  });
  const togglePortrait = useCallback(() => {
    setPortraitMode(v => { const next = !v; try { localStorage.setItem("ss_portrait_mode", next ? "1" : "0"); } catch { /**/ } return next; });
  }, []);

  // ── Stream state ───────────────────────────────────────────────────────────
  const [connStatus, setConnStatus]   = useState<"idle"|"connecting"|"connected">("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting]  = useState(false);
  const [connStep, setConnStep]       = useState<"auth"|"engine"|null>(null);
  const [elapsed, setElapsed]         = useState(0);

  // ── Devices ───────────────────────────────────────────────────────────────
  const [cameras, setCameras]             = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics]                   = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [cameraReady, setCameraReady]     = useState(false);

  // ── Video style ───────────────────────────────────────────────────────────
  const [selectedStyle, setSelectedStyle] = useState<StyleId>("hyper-real");
  const [customPrompt, setCustomPrompt]   = useState("");
  const [refImageB64, setRefImageB64]     = useState<string|null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string|null>(null);

  // ── Audio sync ────────────────────────────────────────────────────────────
  const [syncDelay, setSyncDelay]     = useState(0.8);
  const [vuLevel, setVuLevel]         = useState(0);
  const [audioActive, setAudioActive] = useState(false);

  // ── Voice cloning ─────────────────────────────────────────────────────────
  const [vcEnabled, setVcEnabled]         = useState(false);
  const [vcActive, setVcActive]           = useState(false);
  const [vcVu, setVcVu]                   = useState(0);
  const [vcVoiceId, setVcVoiceId]         = useState(BUILTIN_VOICES[0].id);
  const [savedVoices, setSavedVoices]     = useState<SavedVoice[]>(() => getSavedVoices());
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [uploadVoiceName, setUploadVoiceName] = useState("");
  const [vcAnalyser, setVcAnalyser]       = useState<AnalyserNode | null>(null);
  const [micAnalyser, setMicAnalyser]     = useState<AnalyserNode | null>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen]       = useState(false);
  const [isPopoutOpen, setIsPopoutOpen]       = useState(false);
  const [isObsModeActive, setIsObsModeActive] = useState(false);
  const [obsInstructions, setObsInstructions] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement>(null);
  const localStreamRef  = useRef<MediaStream|null>(null);
  const videoSessionRef = useRef<VideoSession|null>(null);
  const syncPipeRef     = useRef<AudioSyncPipeline|null>(null);
  const clonerRef       = useRef<VoiceCloningEngine|null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval>|null>(null);
  const popoutRef       = useRef<Window|null>(null);
  const obsWindowRef    = useRef<Window|null>(null);
  const remoteStreamRef = useRef<MediaStream|null>(null);
  const isStartingRef   = useRef(false);
  // Mic-only analyser for audio-only tab waveform
  const micOnlyAudioCtxRef  = useRef<AudioContext|null>(null);
  const micOnlyAnalyserRef  = useRef<AnalyserNode|null>(null);
  const micOnlyStreamRef    = useRef<MediaStream|null>(null);

  const credsMissing = !hasCredentials();
  const voiceKeySet  = hasVoiceKey();

  // ─── All voices merged ─────────────────────────────────────────────────────
  const allVoices = [...savedVoices.map(v => ({ id: v.id, name: `★ ${v.name}` })), ...BUILTIN_VOICES];

  // ─── Enumerate devices ─────────────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const vids = devs.filter(d => d.kind === "videoinput");
      const auds = devs.filter(d => d.kind === "audioinput");
      setCameras(vids); setMics(auds);
      if (vids.length && !selectedCamId) setSelectedCamId(vids[0].deviceId);
      if (auds.length && !selectedMicId) setSelectedMicId(auds[0].deviceId);
    } catch { /* ignore */ }
  }, [selectedCamId, selectedMicId]);

  useEffect(() => { enumerateDevices(); }, []);

  // ─── Tab switch: stop stream first ─────────────────────────────────────────
  const switchTab = useCallback((tab: TabId) => {
    if (isStreaming || isStarting) {
      teardownStream();
      toast({ title: "Stream stopped", description: "Switching modes." });
    }
    setActiveTab(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, isStarting]);

  // ─── Camera ────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (deviceId?: string) => {
    const id = deviceId ?? selectedCamId;
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCameraReady(true); enumerateDevices();
    } catch { toast({ title: "Camera Error", description: "Could not access camera.", variant: "destructive" }); }
  }, [selectedCamId, enumerateDevices, toast]);

  const handleCameraSwitch = useCallback(async (id: string) => {
    setSelectedCamId(id); if (cameraReady) await startCamera(id);
  }, [cameraReady, startCamera]);

  // ─── Mic-only preview for audio-only tab ───────────────────────────────────
  const startMicPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true, video: false,
      });
      micOnlyStreamRef.current?.getTracks().forEach(t => t.stop());
      micOnlyStreamRef.current = stream;
      micOnlyAudioCtxRef.current?.close().catch(() => {});
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 256;
      src.connect(an);
      micOnlyAudioCtxRef.current = ctx;
      micOnlyAnalyserRef.current = an;
      setMicAnalyser(an);
    } catch { /* ignore */ }
  }, [selectedMicId]);

  useEffect(() => {
    if (activeTab === "audio-only") { startMicPreview(); }
    else {
      micOnlyStreamRef.current?.getTracks().forEach(t => t.stop());
      micOnlyAudioCtxRef.current?.close().catch(() => {});
      micOnlyStreamRef.current = null; micOnlyAnalyserRef.current = null;
      setMicAnalyser(null);
    }
  }, [activeTab, startMicPreview]);

  // ─── Teardown ──────────────────────────────────────────────────────────────
  const teardownStream = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isStartingRef.current = false;
    videoSessionRef.current?.close(); videoSessionRef.current = null;
    clonerRef.current?.stop(); clonerRef.current = null;
    syncPipeRef.current?.stop(); syncPipeRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null; window.__ssRemoteStream = null;
    [popoutRef, obsWindowRef].forEach(r => {
      if (r.current && !r.current.closed) try { r.current.postMessage("stream-studio-clear", "*"); } catch { /**/ }
    });
    sessionEnd();
    setIsStreaming(false); setConnStatus("idle"); setConnStep(null); setElapsed(0);
    setAudioActive(false); setSyncDelay(0.8); setVuLevel(0);
    setVcActive(false); setVcVu(0); setVcAnalyser(null);
  }, []);

  // ─── Start stream ──────────────────────────────────────────────────────────
  const handleStartStream = useCallback(async () => {
    if (isStartingRef.current || isStreaming) return;
    const needsVideo = activeTab !== "audio-only";
    const needsVoice = activeTab !== "video-only" && vcEnabled;

    if (credsMissing && needsVideo) { setLocation("/settings"); return; }
    if (needsVideo && (!cameraReady || !localStreamRef.current)) {
      toast({ title: "Camera not ready", description: "Enable your camera first.", variant: "destructive" }); return;
    }

    const apiKey    = getApiKey()!;
    const voiceKey  = getVoiceKey() ?? "";

    isStartingRef.current = true; setIsStarting(true); setConnStep("auth"); setConnStatus("connecting");

    try {
      setConnStep("engine");
      const style  = STYLES.find(s => s.id === selectedStyle)!;
      const prompt = customPrompt.trim() || style.prompt;

      // ── Audio sync pipeline (video tabs only) ──────────────────────────
      let sendStream = localStreamRef.current ?? new MediaStream();
      let micStreamForCloner: MediaStream | null = null;

      if (needsVideo) {
        const pipe = new AudioSyncPipeline();
        pipe.onUpdate = (delay, vu) => {
          setSyncDelay(delay); setVuLevel(vu);
          clonerRef.current?.setVideoDelay(delay);
        };
        const dest = await pipe.start(remoteVideoRef.current!, selectedMicId || undefined);
        syncPipeRef.current = pipe;
        if (dest) {
          const track = dest.stream.getAudioTracks()[0];
          if (track) { sendStream = new MediaStream([...(localStreamRef.current?.getVideoTracks() ?? []), track]); setAudioActive(true); }
        }
        micStreamForCloner = pipe.getMicStream();
      }

      // ── Start video session ────────────────────────────────────────────
      if (needsVideo) {
        const session = await _startVideoSession(
          apiKey, sendStream,
          remote => {
            remoteStreamRef.current = remote;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
            window.__ssRemoteStream = remote;
            _notifyPopup(popoutRef.current); _notifyPopup(obsWindowRef.current);
            setConnStatus("connected");
          },
          () => { teardownStream(); toast({ title: "Stream disconnected", description: "Connection lost. Try again.", variant: "destructive" }); },
          prompt, refImageB64,
        );
        videoSessionRef.current = session;
      } else {
        // Audio-only: start mic preview
        micStreamForCloner = micOnlyStreamRef.current;
        setConnStatus("connected");
      }

      // ── Start voice cloning ────────────────────────────────────────────
      if (needsVoice && voiceKeySet && (micStreamForCloner || micOnlyStreamRef.current)) {
        const cloner = new VoiceCloningEngine();
        cloner.apiKey  = voiceKey;
        cloner.voiceId = vcVoiceId;
        cloner.setVideoDelay(syncPipeRef.current?.detectedDelay ?? 0.3);
        cloner.onVu    = v => setVcVu(v);
        cloner.onError = msg => toast({ title: "Voice engine error", description: msg, variant: "destructive" });
        await cloner.start(micStreamForCloner ?? micOnlyStreamRef.current!);
        clonerRef.current = cloner;
        setVcAnalyser(cloner.getAnalyser());
        setVcActive(true);
      }

      sessionStart();
      const t0 = Date.now();
      timerRef.current = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setElapsed(s); sessionTick(s); }, 1000);
      setIsStreaming(true);

    } catch (err) {
      teardownStream();
      toast({ title: "Stream Failed", description: err instanceof Error ? err.message : "Check your keys in Settings.", variant: "destructive" });
    } finally { isStartingRef.current = false; setIsStarting(false); }
  }, [isStreaming, credsMissing, cameraReady, activeTab, selectedStyle, customPrompt, refImageB64,
      selectedMicId, vcEnabled, vcVoiceId, voiceKeySet, teardownStream, toast]);

  const handleStop = useCallback(() => teardownStream(), [teardownStream]);

  // ─── Prompt updates ────────────────────────────────────────────────────────
  const handlePromptChange = useCallback((p: string) => {
    if (videoSessionRef.current && isStreaming) _updatePrompt(videoSessionRef.current, p, refImageB64);
  }, [isStreaming, refImageB64]);

  const handleStyleSelect = useCallback((id: StyleId) => {
    setSelectedStyle(id);
    handlePromptChange(customPrompt.trim() || STYLES.find(s => s.id === id)!.prompt);
  }, [customPrompt, handlePromptChange]);

  const handleCustomPromptChange = useCallback((v: string) => {
    setCustomPrompt(v);
    if (isStreaming) handlePromptChange(v.trim() || STYLES.find(s => s.id === selectedStyle)!.prompt);
  }, [isStreaming, selectedStyle, handlePromptChange]);

  // ─── Reference image ───────────────────────────────────────────────────────
  const handleRefImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      const data = ev.target?.result as string; const b64 = data.split(",")[1] ?? data;
      setRefImagePreview(data); setRefImageB64(b64);
      if (videoSessionRef.current && isStreaming) {
        _updatePrompt(videoSessionRef.current, customPrompt.trim() || STYLES.find(s => s.id === selectedStyle)!.prompt, b64);
      }
    };
    r.readAsDataURL(file); e.target.value = "";
  }, [isStreaming, selectedStyle, customPrompt]);

  // ─── Voice upload ──────────────────────────────────────────────────────────
  const handleVoiceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!voiceKeySet) { toast({ title: "Voice Studio Key required", description: "Add your Voice Studio Key in Settings first.", variant: "destructive" }); return; }
    const name = uploadVoiceName.trim() || file.name.replace(/\.[^.]+$/, "");
    setUploadingVoice(true);
    try {
      const voice = await uploadVoice(getVoiceKey()!, name, file);
      addSavedVoice(voice);
      setSavedVoices(getSavedVoices());
      setVcVoiceId(voice.id);
      setUploadVoiceName("");
      toast({ title: "Voice uploaded!", description: `"${voice.name}" is ready to use.` });
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Could not upload voice.", variant: "destructive" });
    } finally { setUploadingVoice(false); }
  }, [voiceKeySet, uploadVoiceName, toast]);

  const handleDeleteVoice = useCallback((id: string) => {
    removeSavedVoice(id); setSavedVoices(getSavedVoices());
    if (vcVoiceId === id) setVcVoiceId(BUILTIN_VOICES[0].id);
  }, [vcVoiceId]);

  // ─── Popup windows ─────────────────────────────────────────────────────────
  const openPopout = useCallback(() => {
    if (popoutRef.current && !popoutRef.current.closed) { popoutRef.current.focus(); return; }
    const w = window.open(_getBaseUrl() + "#/popout", "ss-popout", "width=1280,height=720,menubar=no,toolbar=no,location=no");
    if (!w) return; popoutRef.current = w; setIsPopoutOpen(true);
    w.addEventListener("load", () => _notifyPopup(w));
    const chk = setInterval(() => { if (w.closed) { clearInterval(chk); setIsPopoutOpen(false); popoutRef.current = null; } }, 1000);
  }, []);
  const openObs = useCallback(() => {
    if (obsWindowRef.current && !obsWindowRef.current.closed) { obsWindowRef.current.focus(); return; }
    const w = window.open(_getBaseUrl() + "#/obsout", "ss-obsout", "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
    if (!w) return; obsWindowRef.current = w; setIsObsModeActive(true); setObsInstructions(true);
    w.addEventListener("load", () => _notifyPopup(w));
    const chk = setInterval(() => { if (w.closed) { clearInterval(chk); setIsObsModeActive(false); setObsInstructions(false); obsWindowRef.current = null; } }, 1000);
  }, []);
  const closeObs    = useCallback(() => { obsWindowRef.current?.close(); obsWindowRef.current = null; setIsObsModeActive(false); setObsInstructions(false); }, []);
  const closePopout = useCallback(() => { popoutRef.current?.close(); popoutRef.current = null; setIsPopoutOpen(false); }, []);
  const closeAll    = useCallback(() => { closePopout(); closeObs(); }, [closePopout, closeObs]);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data === "stream-studio-stop") teardownStream();
      else if (e.data === "stream-studio-reconnect" && cameraReady) { teardownStream(); setTimeout(() => handleStartStream(), 300); }
    };
    window.addEventListener("message", h); return () => window.removeEventListener("message", h);
  }, [teardownStream, cameraReady, handleStartStream]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) { teardownStream(); setIsFullscreen(false); return; }
        closeAll(); if (isStreaming) teardownStream(); return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); setIsFullscreen(v => !v); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [isStreaming, isFullscreen, teardownStream, closeAll]);

  const curStyle = STYLES.find(s => s.id === selectedStyle)!;
  const selectSt: React.CSSProperties = { width: "100%", appearance: "none", padding: "8px 32px 8px 12px", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", borderRadius: 8, color: "hsl(190 80% 96%)", fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer", opacity: isStreaming ? 0.5 : 1 };
  const needsVideo = activeTab !== "audio-only";
  const needsVoice = activeTab !== "video-only";

  // ─── Video output panel (portrait & landscape) ────────────────────────────
  // Portrait mode = 9:16 ratio, clean output, no overlay chrome.
  // Landscape mode = 16:9 ratio, OBS/popout buttons visible.
  // The mode toggle sits OUTSIDE the panel so the video output is always clean.
  const VideoOutputPanel = ({ showPiP = true }: { showPiP?: boolean }) => {
    const isPortrait = portraitMode;
    const panelStyle: React.CSSProperties = isPortrait
      ? {
          // 9:16 — exact mobile phone video call ratio
          // Centred, max-width so it doesn't go too wide on large screens
          position: "relative",
          width: "100%",
          maxWidth: 340,
          margin: "0 auto",
          aspectRatio: "9/16",
          borderRadius: 18,
          overflow: "hidden",
          background: "#000",
          boxShadow: connStatus === "connected"
            ? "0 0 60px hsl(187 100% 52% / 0.3), 0 0 0 2px hsl(187 100% 52% / 0.2)"
            : "0 0 0 1px hsl(222 40% 14%)",
        }
      : {
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          borderRadius: 14,
          overflow: "hidden",
          background: "#000",
          boxShadow: connStatus === "connected"
            ? "0 0 40px hsl(187 100% 52% / 0.25), 0 0 0 1px hsl(187 100% 52% / 0.15)"
            : "0 0 0 1px hsl(222 40% 14%)",
        };

    return (
      <div style={panelStyle}>
        {/* AI output video — always clean, no overlay chrome */}
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scaleX(-1)" }} />

        {/* Idle placeholder */}
        {connStatus === "idle" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "radial-gradient(ellipse at center, hsl(222 44% 8%) 0%, hsl(222 47% 4%) 100%)" }}>
            <Zap style={{ width: 32, height: 32, color: C }} />
            <p style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700, color: "hsl(190 80% 96%)" }}>AI Video Output</p>
            <p style={{ fontSize: 13, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", textAlign: "center", padding: "0 20px" }}>
              {isPortrait ? "Portrait mode active" : "Enable camera and click Start"}
            </p>
          </div>
        )}

        {/* OBS / popout / fullscreen overlay — LANDSCAPE ONLY */}
        {!isPortrait && (
          <div style={{ position: "absolute", top: 10, right: 10, zIndex: 20, display: "flex", gap: 6 }}>
            <div style={{ position: "relative" }}>
              <button onClick={isObsModeActive ? closeObs : openObs}
                style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", borderRadius: 20, background: isObsModeActive ? "rgba(0,210,211,0.9)" : "rgba(0,0,0,0.6)", color: isObsModeActive ? "hsl(222 47% 4%)" : "#fff", border: isObsModeActive ? "1px solid rgba(0,210,211,0.6)" : "1px solid rgba(255,255,255,0.2)", fontSize: 10, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1, cursor: "pointer" }}>
                <Monitor style={{ width: 11, height: 11 }} /> OBS
              </button>
              {obsInstructions && (
                <div style={{ position: "absolute", top: 36, right: 0, width: 240, background: "hsl(222 44% 7%)", border: "1px solid rgba(0,210,211,0.3)", borderRadius: 12, padding: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 30 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C, fontFamily: "monospace" }}>● OBS WINDOW OPEN</span>
                    <button onClick={() => setObsInstructions(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>In OBS → Sources → + → Window Capture → select "Stream Studio OBS".</p>
                </div>
              )}
            </div>
            <button onClick={isPopoutOpen ? closePopout : openPopout} style={{ width: 30, height: 30, borderRadius: "50%", background: isPopoutOpen ? "rgba(0,210,211,0.85)" : "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Monitor style={{ width: 13, height: 13 }} />
            </button>
            <button onClick={() => setIsFullscreen(v => !v)} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Maximize2 style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}

        {/* PiP local camera — landscape only, hidden in portrait */}
        {!isPortrait && showPiP && (
          <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 10, width: "22%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", background: "#000" }}>
            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
            {!cameraReady && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(0,0,0,0.85)" }}>
                <Camera style={{ width: 18, height: 18, color: "hsl(222 25% 50%)" }} />
                <button onClick={() => startCamera()} style={{ fontSize: 10, color: C, fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Enable Camera</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Portrait / Landscape toggle button (always outside the video panel) ───
  const OrientationToggle = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <button
        onClick={togglePortrait}
        title={portraitMode ? "Switch to Landscape (16:9)" : "Switch to Portrait (9:16)"}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 10, cursor: "pointer",
          background: portraitMode ? "hsl(187 100% 52% / 0.15)" : "hsl(222 40% 8%)",
          border: `1px solid ${portraitMode ? "hsl(187 100% 52% / 0.5)" : "hsl(222 40% 14%)"}`,
          color: portraitMode ? C : "hsl(222 25% 55%)",
          fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 10,
          letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
        }}>
        {portraitMode
          ? <><Smartphone style={{ width: 13, height: 13 }} /> Portrait (9:16)</>
          : <><Monitor style={{ width: 13, height: 13 }} /> Landscape (16:9)</>}
      </button>
      <span style={{ fontSize: 10, color: "hsl(222 25% 40%)", fontFamily: "'Rajdhani',sans-serif" }}>
        {portraitMode ? "Mobile video call mode — clean output" : "Standard widescreen mode"}
      </span>
    </div>
  );

  // ─── Stream button ─────────────────────────────────────────────────────────
  const canStart = activeTab === "audio-only" ? true : (cameraReady && !credsMissing);
  const StreamBtn = () => isStreaming ? (
    <button onClick={handleStop}
      style={{ width: "100%", height: 54, background: "hsl(0 85% 40% / 0.3)", border: "1px solid hsl(0 85% 55% / 0.5)", borderRadius: 12, cursor: "pointer", color: "hsl(0 85% 75%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.5)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 85% 40% / 0.3)"; }}>
      <Square style={{ width: 18, height: 18 }} /> Stop
    </button>
  ) : (
    <button onClick={handleStartStream} disabled={isStarting || (!canStart)}
      style={{ width: "100%", height: 54, background: (canStart && !isStarting) ? "linear-gradient(135deg, hsl(187 100% 52%) 0%, hsl(200 100% 45%) 100%)" : "hsl(222 40% 11%)", border: "none", borderRadius: 12, cursor: (canStart && !isStarting) ? "pointer" : "not-allowed", color: (canStart && !isStarting) ? "hsl(222 47% 4%)" : "hsl(222 25% 40%)", fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: (canStart && !isStarting) ? "0 0 28px hsl(187 100% 52% / 0.3)" : "none" }}
      onMouseEnter={e => { if (canStart && !isStarting) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = "none"; }}>
      {isStarting ? <><Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Starting…</>
        : credsMissing && needsVideo ? <><Settings style={{ width: 18, height: 18 }} /> Open Settings</>
        : !cameraReady && needsVideo ? <><Camera style={{ width: 18, height: 18 }} /> Enable Camera</>
        : <><Play style={{ width: 18, height: 18 }} /> Start</>}
    </button>
  );

  // ─── Voice cloning panel (shared between tabs) ─────────────────────────────
  const VoicePanel = () => (
    <div style={{ background: "hsl(222 44% 6%)", border: `1px solid ${vcEnabled ? "hsl(265 90% 65% / 0.4)" : "hsl(222 40% 11%)"}`, borderRadius: 14, padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: VC, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace" }}>Voice Cloning</p>
          {vcActive && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: VC, padding: "2px 6px", borderRadius: 10, fontFamily: "'Orbitron',monospace" }}>LIVE</span>}
        </div>
        {/* Toggle */}
        <button onClick={() => {
          if (!voiceKeySet && !vcEnabled) { toast({ title: "Voice Studio Key required", description: "Add your Voice Studio Key in Settings.", variant: "destructive" }); return; }
          setVcEnabled(v => !v);
        }}
          style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: vcEnabled ? VC : "hsl(222 40% 14%)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: vcEnabled ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
        </button>
      </div>

      {!voiceKeySet && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "hsl(40 100% 52% / 0.08)", border: "1px solid hsl(40 100% 52% / 0.2)", marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: "hsl(40 100% 75%)", fontFamily: "'Rajdhani',sans-serif" }}>
            Voice Studio Key not set.{" "}
            <button onClick={() => setLocation("/settings")} style={{ color: "hsl(40 100% 75%)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "'Rajdhani',sans-serif", fontSize: 11, padding: 0 }}>Settings →</button>
          </p>
        </div>
      )}

      {/* Voice selector */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "hsl(265 70% 60%)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Orbitron',monospace", marginBottom: 6 }}>Clone Voice</label>
        <div style={{ position: "relative" }}>
          <select value={vcVoiceId} onChange={e => setVcVoiceId(e.target.value)} disabled={isStreaming} style={{ ...selectSt, borderColor: vcEnabled ? "hsl(265 90% 65% / 0.4)" : "hsl(222 40% 14%)" }}>
            {savedVoices.length > 0 && (
              <optgroup label="── Your Voices ──">
                {savedVoices.map(v => <option key={v.id} value={v.id}>★ {v.name}</option>)}
              </optgroup>
            )}
            <optgroup label="── Built-in Voices ──">
              {BUILTIN_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </optgroup>
          </select>
          <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 50%)", pointerEvents: "none" }} />
        </div>
      </div>

      {/* Upload your own voice */}
      <div style={{ background: "hsl(222 40% 8%)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "hsl(265 70% 60%)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>Upload Your Voice</p>
        <input
          type="text" placeholder="Voice name (optional)"
          value={uploadVoiceName} onChange={e => setUploadVoiceName(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", borderRadius: 7, background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", color: "hsl(190 80% 96%)", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", outline: "none", marginBottom: 8 }}
          onFocus={e => { e.target.style.borderColor = "hsl(265 90% 65% / 0.5)"; }}
          onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, cursor: uploadingVoice ? "not-allowed" : "pointer", background: uploadingVoice ? "hsl(222 40% 10%)" : "hsl(265 90% 65% / 0.15)", border: "1px solid hsl(265 90% 65% / 0.35)", color: VC, fontSize: 12, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>
          {uploadingVoice ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 14, height: 14 }} />}
          {uploadingVoice ? "Uploading…" : "Upload Voice Sample (MP3/WAV/M4A)"}
          <input type="file" accept=".mp3,.wav,.m4a,audio/*" onChange={handleVoiceUpload} disabled={uploadingVoice} style={{ display: "none" }} />
        </label>
        <p style={{ fontSize: 10, color: "hsl(222 25% 40%)", fontFamily: "'Rajdhani',sans-serif", marginTop: 6, lineHeight: 1.4 }}>
          Upload 30s–3min of clear speech. Your voice will be cloned and saved for future sessions.
        </p>
      </div>

      {/* Saved voices list */}
      {savedVoices.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "hsl(265 70% 60%)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Orbitron',monospace", marginBottom: 6 }}>Your Voices</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedVoices.map(v => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: vcVoiceId === v.id ? "hsl(265 90% 65% / 0.15)" : "hsl(222 40% 8%)", border: `1px solid ${vcVoiceId === v.id ? "hsl(265 90% 65% / 0.4)" : "hsl(222 40% 12%)"}`, cursor: "pointer" }}
                onClick={() => setVcVoiceId(v.id)}>
                <span style={{ fontSize: 11, color: "hsl(190 80% 90%)", fontFamily: "'Rajdhani',sans-serif", flex: 1, fontWeight: vcVoiceId === v.id ? 700 : 400 }}>★ {v.name}</span>
                <button onClick={e => { e.stopPropagation(); handleDeleteVoice(v.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(0 85% 55%)", padding: 2, display: "flex" }}>
                  <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waveform — input voice */}
      {vcActive && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 9, color: "hsl(222 25% 45%)", fontFamily: "'Orbitron',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Cloned Voice Output</p>
          <Waveform analyser={vcAnalyser} color={VC} height={60} />
          <div style={{ height: 5, background: "hsl(222 40% 11%)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", borderRadius: 3, transition: "width 0.08s", width: `${vcVu}%`, background: VC }} />
          </div>
        </div>
      )}
    </div>
  );

  // ─── Device selectors (shared) ─────────────────────────────────────────────
  const DeviceSelectors = ({ showCamera }: { showCamera: boolean }) => (
    <>
      {showCamera && (
        <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "hsl(187 100% 52% / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Camera style={{ width: 15, height: 15, color: C }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(190 80% 96%)", fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>Camera</p>
              <span style={{ fontSize: 10, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>{cameras.length} found</span>
            </div>
            {cameras.length === 0 ? <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>No cameras found.</p> : (
              <div style={{ position: "relative" }}>
                <select value={selectedCamId} onChange={e => handleCameraSwitch(e.target.value)} disabled={isStreaming} style={selectSt}>
                  {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
                </select>
                <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 50%)", pointerEvents: "none" }} />
              </div>
            )}
          </div>
          <button onClick={enumerateDevices} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 50%)", padding: 4 }}><RefreshCw style={{ width: 13, height: 13 }} /></button>
        </div>
      )}

      <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "hsl(187 100% 52% / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Mic style={{ width: 15, height: 15, color: C }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(190 80% 96%)", fontFamily: "'Orbitron',monospace", letterSpacing: "0.06em" }}>Microphone</p>
            <span style={{ fontSize: 10, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>{mics.length} found</span>
          </div>
          {mics.length === 0 ? <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>No microphones found.</p> : (
            <div style={{ position: "relative" }}>
              <select value={selectedMicId} onChange={e => setSelectedMicId(e.target.value)} disabled={isStreaming} style={selectSt}>
                {mics.map((m, i) => <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>)}
              </select>
              <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(222 25% 50%)", pointerEvents: "none" }} />
            </div>
          )}
        </div>
        <button onClick={enumerateDevices} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(222 25% 50%)", padding: 4 }}><RefreshCw style={{ width: 13, height: 13 }} /></button>
      </div>
    </>
  );

  // ─── Audio sync status panel ───────────────────────────────────────────────
  const AudioSyncPanel = () => (
    <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace" }}>Audio Sync</p>
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: audioActive ? "hsl(187 100% 52% / 0.12)" : "hsl(222 40% 9%)", border: `1px solid ${audioActive ? "hsl(187 100% 52% / 0.35)" : "hsl(222 40% 14%)"}` }}>
          {audioActive ? <Wifi style={{ width: 10, height: 10, color: C }} /> : <WifiOff style={{ width: 10, height: 10, color: "hsl(222 25% 40%)" }} />}
          <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: audioActive ? C : "hsl(222 25% 40%)" }}>{audioActive ? "SYNCED" : "IDLE"}</span>
        </div>
      </div>
      {audioActive ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Mic style={{ width: 11, height: 11, color: C }} />
              <span style={{ fontSize: 11, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>{mics.find(m => m.deviceId === selectedMicId)?.label || "Microphone"}</span>
            </div>
            <div style={{ height: 6, background: "hsl(222 40% 11%)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, transition: "width 0.05s", width: `${vuLevel}%`, background: vuLevel > 80 ? "hsl(0 85% 55%)" : vuLevel > 50 ? "hsl(40 100% 55%)" : C }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "hsl(222 40% 8%)", border: "1px solid hsl(222 40% 12%)" }}>
            <span style={{ fontSize: 12, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Auto-sync delay</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C, fontFamily: "'Orbitron',monospace" }}>{syncDelay.toFixed(2)}s</span>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "hsl(222 25% 45%)", fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5 }}>
          Mic audio is auto-delayed to match AI video lip movements when streaming starts.
        </p>
      )}
    </div>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>

      {/* Missing key banner */}
      {credsMissing && needsVideo && (
        <div style={{ margin: "16px 32px 0", padding: "12px 18px", borderRadius: 10, background: "hsl(40 100% 52% / 0.1)", border: "1px solid hsl(40 100% 52% / 0.35)", display: "flex", alignItems: "center", gap: 12 }}>
          <Settings style={{ width: 16, height: 16, color: "hsl(40 100% 62%)", flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "hsl(40 100% 75%)", fontFamily: "'Rajdhani',sans-serif", flex: 1 }}>
            <strong>Video Engine Key not set.</strong> Open Settings to add it before streaming.
          </p>
          <button onClick={() => setLocation("/settings")} style={{ padding: "6px 14px", borderRadius: 8, background: "hsl(40 100% 52% / 0.25)", border: "1px solid hsl(40 100% 52% / 0.5)", color: "hsl(40 100% 80%)", fontWeight: 700, fontSize: 12, fontFamily: "'Orbitron',monospace", cursor: "pointer" }}>
            Settings
          </button>
        </div>
      )}

      {/* Starting overlay */}
      {isStarting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(8px)", background: "hsl(222 47% 4% / 0.88)" }} />
          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 360, width: "100%", margin: "0 16px", textAlign: "center", padding: 36, borderRadius: 20, background: "hsl(222 44% 6%)", border: "1px solid hsl(187 100% 52% / 0.22)" }}>
            <Loader2 style={{ width: 40, height: 40, color: C, animation: "spin 1s linear infinite" }} />
            <div>
              <h3 style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 16, color: "hsl(190 80% 96%)", marginBottom: 8 }}>Starting…</h3>
              <p style={{ fontSize: 13, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>
                {connStep === "engine" ? "2/2 · Connecting to AI engine…" : "1/2 · Validating key…"}
              </p>
            </div>
            <button onClick={() => teardownStream()} style={{ padding: "10px 20px", borderRadius: 8, width: "100%", background: "transparent", border: "1px solid hsl(187 100% 52% / 0.25)", color: "hsl(187 100% 52% / 0.8)", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <X style={{ width: 14, height: 14 }} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#000" }}>
          <video autoPlay playsInline ref={el => { if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          <button onClick={() => { teardownStream(); setIsFullscreen(false); }}
            style={{ position: "absolute", top: 16, left: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(220,38,38,0.85)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
          {isStreaming && <div style={{ position: "absolute", top: 16, right: 16, padding: "4px 12px", borderRadius: 20, background: "rgba(0,0,0,0.6)", color: C, fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 13 }}>{formatTime(elapsed)}</div>}
        </div>
      )}

      <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 20, color: "hsl(190 80% 96%)", marginBottom: 2 }}>{APP}</h1>
            <p style={{ fontSize: 13, color: "hsl(222 25% 55%)", fontFamily: "'Rajdhani',sans-serif" }}>Real-time AI video &amp; voice transformation</p>
          </div>
          {isStreaming && connStatus === "connected" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: "hsl(0 85% 55% / 0.1)", border: "1px solid hsl(0 85% 55% / 0.2)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(0 85% 65%)", animation: "pulse 2s ease-in-out infinite" }} />
              <span style={{ fontSize: 11, color: "hsl(0 85% 70%)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>LIVE · {formatTime(elapsed)}</span>
            </div>
          )}
        </div>

        {/* ── 3 TABS ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "hsl(222 44% 5%)", padding: 4, borderRadius: 14, border: "1px solid hsl(222 40% 10%)" }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => switchTab(tab.id)}
                style={{
                  flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", border: "none", transition: "all 0.2s", textAlign: "center",
                  background: active ? "linear-gradient(135deg, hsl(187 100% 52% / 0.2), hsl(200 100% 45% / 0.1))" : "transparent",
                  boxShadow: active ? "inset 0 0 0 1px hsl(187 100% 52% / 0.4)" : "none",
                }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <tab.Icon style={{ width: 18, height: 18, color: active ? C : "hsl(222 25% 45%)" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Orbitron',monospace", letterSpacing: "0.04em", color: active ? C : "hsl(222 25% 55%)", textTransform: "uppercase" }}>
                    {tab.label}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: "'Rajdhani',sans-serif", color: active ? "hsl(187 100% 52% / 0.7)" : "hsl(222 25% 38%)", display: "block" }}>
                    {tab.sub}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Video + Audio                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "video-audio" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", gap: 20 }}>
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* AI Output video — portrait or landscape */}
              <VideoOutputPanel showPiP={true} />
              {/* Orientation toggle — always outside the video, always clean */}
              <OrientationToggle />
              <DeviceSelectors showCamera={true} />
              <StreamBtn />
            </div>
            {/* Right sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Style presets */}
              <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 12 }}>AI Style</p>
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
                <textarea value={customPrompt} onChange={e => handleCustomPromptChange(e.target.value)} placeholder={curStyle.prompt} rows={3}
                  style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", color: "hsl(190 80% 96%)", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5, outline: "none" }}
                  onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }}
                  onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
                {customPrompt && <button onClick={() => handleCustomPromptChange("")} style={{ marginTop: 6, fontSize: 11, color: "hsl(222 25% 50%)", background: "none", border: "none", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>↺ Reset</button>}
              </div>
              <AudioSyncPanel />
              <VoicePanel />
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
                    <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", textAlign: "center" }}>Upload face reference to guide the AI</p>
                    <input type="file" accept="image/*" onChange={handleRefImage} style={{ display: "none" }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: Audio Call Only                                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "audio-only" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", gap: 20 }}>
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Waveform display */}
              <div style={{ borderRadius: 14, overflow: "hidden", background: "hsl(222 44% 5%)", border: `1px solid ${connStatus === "connected" ? "hsl(265 90% 65% / 0.4)" : "hsl(222 40% 14%)"}`, padding: 24, boxShadow: connStatus === "connected" ? "0 0 40px hsl(265 90% 65% / 0.15)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "hsl(265 90% 65% / 0.15)", border: "1px solid hsl(265 90% 65% / 0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Headphones style={{ width: 20, height: 20, color: VC }} />
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Orbitron',monospace", fontWeight: 700, fontSize: 13, color: "hsl(190 80% 96%)" }}>Audio Call</p>
                      <p style={{ fontSize: 11, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif" }}>Voice cloning active</p>
                    </div>
                  </div>
                  {connStatus === "connected" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "hsl(265 90% 65% / 0.15)", border: "1px solid hsl(265 90% 65% / 0.4)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: VC, animation: "pulse 2s ease-in-out infinite" }} />
                      <span style={{ fontSize: 10, color: VC, fontFamily: "'Orbitron',monospace", fontWeight: 700 }}>LIVE</span>
                    </div>
                  )}
                </div>

                {/* Input waveform */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 9, color: "hsl(222 25% 40%)", fontFamily: "'Orbitron',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Your Voice (Input)</p>
                  <Waveform analyser={micAnalyser} color={C} height={72} />
                </div>

                {/* Output waveform */}
                <div>
                  <p style={{ fontSize: 9, color: "hsl(265 70% 60%)", fontFamily: "'Orbitron',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Cloned Voice (Output)</p>
                  <Waveform analyser={vcAnalyser} color={VC} height={72} />
                </div>

                {/* Volume bar */}
                {vcActive && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 6, background: "hsl(222 40% 11%)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width 0.08s", width: `${vcVu}%`, background: `linear-gradient(90deg, ${VC}, hsl(200 80% 65%))` }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: "hsl(222 25% 40%)", fontFamily: "'Rajdhani',sans-serif" }}>Output level</span>
                      <Volume2 style={{ width: 11, height: 11, color: VC }} />
                    </div>
                  </div>
                )}
              </div>

              <DeviceSelectors showCamera={false} />
              <StreamBtn />
            </div>
            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <VoicePanel />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Video Call Only                                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "video-only" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", gap: 20 }}>
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <VideoOutputPanel showPiP={true} />
              <OrientationToggle />
              <DeviceSelectors showCamera={true} />
              <StreamBtn />
            </div>
            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 12 }}>AI Style</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {STYLES.map(s => (
                    <button key={s.id} onClick={() => handleStyleSelect(s.id)}
                      style={{ padding: "7px 4px", borderRadius: 8, cursor: "pointer", background: selectedStyle === s.id ? `${s.color}22` : "hsl(222 40% 8%)", border: `1px solid ${selectedStyle === s.id ? s.color + "66" : "hsl(222 40% 12%)"}`, color: selectedStyle === s.id ? s.color : "hsl(222 25% 55%)", fontSize: 9, fontWeight: 700, fontFamily: "'Orbitron',monospace", boxShadow: selectedStyle === s.id ? `0 0 12px ${s.color}33` : "none" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ background: "hsl(222 44% 6%)", border: "1px solid hsl(222 40% 11%)", borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>Custom Prompt</p>
                <textarea value={customPrompt} onChange={e => handleCustomPromptChange(e.target.value)} placeholder={curStyle.prompt} rows={3}
                  style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical", background: "hsl(222 47% 4%)", border: "1px solid hsl(222 40% 14%)", color: "hsl(190 80% 96%)", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", lineHeight: 1.5, outline: "none" }}
                  onFocus={e => { e.target.style.borderColor = "hsl(187 100% 52% / 0.5)"; }}
                  onBlur={e => { e.target.style.borderColor = "hsl(222 40% 14%)"; }} />
              </div>
              <AudioSyncPanel />
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
                    <p style={{ fontSize: 12, color: "hsl(222 25% 50%)", fontFamily: "'Rajdhani',sans-serif", textAlign: "center" }}>Upload face reference</p>
                    <input type="file" accept="image/*" onChange={handleRefImage} style={{ display: "none" }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </AppLayout>
  );
}
