import { useRef, useEffect } from "react";

// Portrait (9:16) OBS clean-output window.
// The AI stream is 16:9, so we composite it into a portrait frame:
// a blurred, cover-fit copy fills the background and the sharp frame is
// contained in the centre. Both <video> elements share the same MediaStream.
export default function ObsoutPortraitPage() {
  const bgRef = useRef<HTMLVideoElement>(null);
  const fgRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const attach = () => {
      try {
        const stream = (window.opener as any)?.__ssRemoteStream as MediaStream | undefined;
        if (!stream) return;
        if (bgRef.current && bgRef.current.srcObject !== stream) bgRef.current.srcObject = stream;
        if (fgRef.current && fgRef.current.srcObject !== stream) fgRef.current.srcObject = stream;
      } catch { /* cross-origin guard */ }
    };

    attach();

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "stream-studio-stream") attach();
      if (e.data === "stream-studio-clear") {
        if (bgRef.current) bgRef.current.srcObject = null;
        if (fgRef.current) fgRef.current.srcObject = null;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", margin: 0, padding: 0, position: "relative" }}>
      {/* Blurred cover-fit background */}
      <video
        ref={bgRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          filter: "blur(28px) brightness(0.55)",
        }}
      />
      {/* Sharp contained foreground */}
      <video
        ref={fgRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: "scaleX(-1)",
        }}
      />
    </div>
  );
}
