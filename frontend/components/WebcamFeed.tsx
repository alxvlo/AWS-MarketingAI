"use client";

import { useEffect, useRef, useState } from "react";
import FaceOverlay from "@/components/FaceOverlay";

type CameraState = "loading" | "ready" | "denied" | "error" | "snapped";
type Mode = "camera" | "upload";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function WebcamFeed() {
  // ── Camera ──────────────────────────────────────────────────────────────────
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  // Incremented to force video element remount (retake / mode-switch back)
  const [cameraKey, setCameraKey] = useState(0);

  // ── Face detection / snap ───────────────────────────────────────────────────
  const [faceDetected, setFaceDetected] = useState(false);
  const [isStable, setIsStable] = useState(false);
  const [shutterActive, setShutterActive] = useState(false);

  // ── Shared image state (set by snap or file upload) ─────────────────────────
  // _imageBlob is written here and consumed by AWS-52's upload handler
  const [_imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // ── Upload mode ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("camera");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const streamRef = useRef<MediaStream | null>(null);
  // Stable pointer for use inside snap (avoids stale closure from setTimeout)
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const snapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Camera effect ────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("effect fired, videoEl:", videoEl);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        console.log("stream obtained:", stream);
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
          console.log("srcObject set:", videoElRef.current.srcObject);
        }
        setCameraState("ready");
      } catch (err) {
        console.log("error name:", (err as Error).name, "message:", (err as Error).message);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setCameraState("denied");
          setErrorMessage("Camera access was denied. Please allow camera access in your browser settings and reload the page.");
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          setCameraState("error");
          setErrorMessage("No camera found. Please connect a camera and try again.");
        } else {
          setCameraState("error");
          setErrorMessage("Unable to access camera. Please check your device and try again.");
        }
      }
    }

    if (videoEl) startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [videoEl]);

  // ── Stability timer cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
    };
  }, []);

  // ── Progress bar animation (imperative to avoid React transition quirks) ─────
  useEffect(() => {
    const bar = progressBarRef.current;
    if (!bar) return;
    if (isStable) {
      // Reset to full width instantly, then start the shrink transition
      bar.style.transition = "none";
      bar.style.width = "100%";
      bar.getBoundingClientRect(); // force reflow so the reset paints before transition
      bar.style.transition = "width 1500ms linear";
      bar.style.width = "0%";
    } else {
      bar.style.transition = "none";
      bar.style.width = "100%";
    }
  }, [isStable]);

  // ── Snap ─────────────────────────────────────────────────────────────────────
  function handleSnap() {
    const video = videoElRef.current;
    const canvas = snapCanvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setImagePreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
    canvas.toBlob((blob) => { if (blob) setImageBlob(blob); }, "image/jpeg", 0.92);

    // Shutter flash: show white overlay, fade it out after 200 ms
    setShutterActive(true);
    setTimeout(() => setShutterActive(false), 200);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsStable(false);
    setCameraState("snapped");
  }

  // ── Detection change callback ────────────────────────────────────────────────
  function handleDetectionChange(detected: boolean) {
    setFaceDetected(detected);
    if (detected) {
      if (!stabilityTimerRef.current) {
        setIsStable(true);
        stabilityTimerRef.current = setTimeout(() => {
          stabilityTimerRef.current = null;
          handleSnap();
        }, 1500);
      }
    } else {
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
      setIsStable(false);
    }
  }

  // ── Retake ───────────────────────────────────────────────────────────────────
  function handleRetake() {
    setImageBlob(null);
    setImagePreviewUrl(null);
    setIsStable(false);
    setFaceDetected(false);
    setCameraState("loading");
    setCameraKey((k) => k + 1); // forces video element remount → triggers camera effect
  }

  // ── Mode switch ──────────────────────────────────────────────────────────────
  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "upload") {
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsStable(false);
      setFaceDetected(false);
      setImageBlob(null);
      setImagePreviewUrl(null);
    } else {
      setImageBlob(null);
      setImagePreviewUrl(null);
      setFileError(null);
      setCameraState("loading");
      setCameraKey((k) => k + 1);
    }
    setMode(next);
  }

  // ── File upload ───────────────────────────────────────────────────────────────
  function processFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Only JPEG, PNG, or WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("File size must be under 5 MB.");
      return;
    }
    setFileError(null);
    setImageBlob(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() { setIsDragOver(false); }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleChooseDifferent() {
    setImageBlob(null);
    setImagePreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Derived booleans ─────────────────────────────────────────────────────────
  const cameraLive = mode === "camera" && cameraState === "ready";
  const cameraSnapped = mode === "camera" && cameraState === "snapped";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mode tabs */}
      <div className="flex rounded-lg border border-slate-200 p-1 mb-4 bg-slate-50">
        {(["camera", "upload"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={[
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
              mode === m
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {m === "camera" ? "Use Camera" : "Upload a Photo"}
          </button>
        ))}
      </div>

      {/* ── Camera mode ─────────────────────────────────────────────────────── */}
      {mode === "camera" && (
        <>
          <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
            {/* Loading */}
            {cameraState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 rounded-xl">
                <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                <p className="mt-3 text-sm text-slate-400">Initializing camera…</p>
              </div>
            )}

            {/* Permission denied */}
            {cameraState === "denied" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 rounded-xl px-6 text-center">
                <svg className="w-12 h-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                </svg>
                <p className="text-sm font-semibold text-red-400 mb-1">Camera access denied</p>
                <p className="text-xs text-slate-400 max-w-xs">{errorMessage}</p>
              </div>
            )}

            {/* Error */}
            {cameraState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 rounded-xl px-6 text-center">
                <svg className="w-12 h-12 text-amber-400 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm font-semibold text-amber-400 mb-1">Camera unavailable</p>
                <p className="text-xs text-slate-400 max-w-xs">{errorMessage}</p>
              </div>
            )}

            {/* Snapped preview */}
            {cameraSnapped && imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Captured photo"
                className="w-full h-full object-cover rounded-xl"
              />
            )}

            {/* Live video — always in DOM so srcObject can be assigned */}
            <video
              key={cameraKey}
              ref={(node) => {
                videoElRef.current = node;
                setVideoEl(node);
              }}
              autoPlay
              playsInline
              muted
              className={[
                "w-full h-full object-cover rounded-xl",
                cameraLive ? "block" : "hidden",
              ].join(" ")}
            />

            {/* Face detection overlay */}
            {cameraLive && (
              <FaceOverlay videoEl={videoEl} onDetectionChange={handleDetectionChange} />
            )}

            {/* Countdown overlay */}
            {cameraLive && isStable && (
              <>
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm font-medium px-3 py-1 rounded-full pointer-events-none select-none">
                  Hold still…
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20 rounded-b-xl overflow-hidden pointer-events-none">
                  <div ref={progressBarRef} className="h-full bg-green-400" style={{ width: "100%" }} />
                </div>
              </>
            )}

            {/* Shutter flash */}
            <div
              className={[
                "absolute inset-0 rounded-xl bg-white pointer-events-none transition-opacity duration-200",
                shutterActive ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          </div>

          {/* Detection status text */}
          {cameraLive && (
            <p className={["mt-2 text-sm text-center", faceDetected ? "text-green-500" : "text-slate-500"].join(" ")}>
              {faceDetected ? "Face detected ✓" : "Position your face in the frame"}
            </p>
          )}

          {/* Post-snap action buttons */}
          {cameraSnapped && (
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleRetake}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Retake
              </button>
              <button
                disabled
                className="flex-1 rounded-lg bg-slate-200 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed"
              >
                Send for Analysis
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Upload mode ──────────────────────────────────────────────────────── */}
      {mode === "upload" && (
        <>
          {!imagePreviewUrl ? (
            /* Drag-and-drop zone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                "w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center",
                "py-14 px-6 text-center cursor-pointer transition-colors",
                isDragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-300 hover:border-slate-400 bg-slate-50",
              ].join(" ")}
            >
              <svg className="w-10 h-10 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-slate-700">
                Drag &amp; drop a photo, or{" "}
                <span className="text-blue-600">browse</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">JPEG, PNG, or WebP · max 5 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            /* Upload preview */
            <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
              <img
                src={imagePreviewUrl}
                alt="Uploaded photo"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          )}

          {fileError && (
            <p className="mt-2 text-xs text-red-500 text-center">{fileError}</p>
          )}

          {imagePreviewUrl && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                disabled
                className="w-full rounded-lg bg-slate-200 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed"
              >
                Send for Analysis
              </button>
              <button
                onClick={handleChooseDifferent}
                className="text-sm text-center text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
              >
                Choose a different photo
              </button>
            </div>
          )}
        </>
      )}

      {/* Hidden canvas used for snapshot rendering */}
      <canvas ref={snapCanvasRef} className="hidden" />
    </>
  );
}
