"use client";

import { useEffect, useRef, useState } from "react";
import FaceOverlay from "@/components/FaceOverlay";
import { submitPhoto, SubmissionResult } from "@/lib/api";

type CameraState = "loading" | "ready" | "denied" | "error" | "snapped";
type Mode = "camera" | "upload";
type UploadState = "idle" | "uploading" | "done" | "error";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface WebcamFeedProps {
  email: string;
}

function ResultPanel({ result }: { result: SubmissionResult }) {
  switch (result.status) {
    case "email_sent":
      return (
        <div className="mt-3 border-l-2 pl-4 py-2" style={{ borderLeftColor: "var(--status-success)" }}>
          <p className="eyebrow mb-1" style={{ color: "var(--status-success)" }}>Analysis complete</p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Emotion: <span className="font-medium capitalize">{result.dominantEmotion.toLowerCase()}</span></p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Email sent: <span className="numeric">{result.emailSentAt ? new Date(result.emailSentAt).toLocaleTimeString() : "—"}</span></p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Template: <span className="font-medium">{result.templateUsed}</span></p>
        </div>
      );
    case "no_face_detected":
      return (
        <div className="mt-3 border-l-2 pl-4 py-2" style={{ borderLeftColor: "var(--status-warning)" }}>
          <p className="eyebrow mb-1" style={{ color: "var(--status-warning)" }}>No face detected</p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Try retaking with better lighting.</p>
        </div>
      );
    case "invalid_file":
      return (
        <div className="mt-3 border-l-2 pl-4 py-2" style={{ borderLeftColor: "var(--status-error)" }}>
          <p className="eyebrow mb-1" style={{ color: "var(--status-error)" }}>Invalid file</p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Please upload a valid JPEG/PNG/WebP under 5 MB.</p>
        </div>
      );
    case "email_failed":
      return (
        <div className="mt-3 border-l-2 pl-4 py-2" style={{ borderLeftColor: "var(--status-error)" }}>
          <p className="eyebrow mb-1" style={{ color: "var(--status-error)" }}>Email failed</p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Emotion detected (<span className="capitalize">{result.dominantEmotion.toLowerCase()}</span>) but email failed to send.</p>
        </div>
      );
    default:
      return null;
  }
}

export default function WebcamFeed({ email }: WebcamFeedProps) {
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
  const [faceDetectionAvailable, setFaceDetectionAvailable] = useState(true);

  // ── Shared image state (set by snap or file upload) ─────────────────────────
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // ── Upload / result state ─────────────────────────────────────────────────
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadStatus, setUploadStatus] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    async function startCamera() {
      // navigator.mediaDevices is undefined outside a secure context
      // (HTTP, file://, some embedded webviews). Accessing .getUserMedia
      // directly would throw a TypeError that bypasses the DOMException
      // handlers below.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("error");
        setErrorMessage(
          "Camera API unavailable. This page must be served over HTTPS in a supported browser."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
        }
        setCameraState("ready");
      } catch (err) {
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

  // ── Submit photo ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!imageBlob) return;
    if (!email.trim()) {
      setUploadError("Please enter your email address before submitting.");
      setUploadState("error");
      document.getElementById("email")?.focus();
      return;
    }
    setUploadState("uploading");
    setUploadError(null);
    setResult(null);
    try {
      const res = await submitPhoto(email.trim(), imageBlob, (msg) =>
        setUploadStatus(msg)
      );
      setResult(res);
      setUploadState("done");
    } catch (err) {
      setUploadError((err as Error).message);
      setUploadState("error");
    }
  }

  // ── Retake ───────────────────────────────────────────────────────────────────
  function handleRetake() {
    setImageBlob(null);
    setImagePreviewUrl(null);
    setIsStable(false);
    setFaceDetected(false);
    setFaceDetectionAvailable(true);
    setCameraState("loading");
    setCameraKey((k) => k + 1); // forces video element remount → triggers camera effect
    setUploadState("idle");
    setUploadStatus("");
    setResult(null);
    setUploadError(null);
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
    setUploadState("idle");
    setUploadStatus("");
    setResult(null);
    setUploadError(null);
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

  // ── Button style constants ────────────────────────────────────────────────────
  const PRIMARY_BTN = "bg-[var(--ink-primary)] text-[var(--bg-canvas)] py-2.5 text-[13px] font-semibold uppercase tracking-wider hover:bg-[var(--accent)] disabled:opacity-50 transition-colors w-full";
  const SECONDARY_BTN = "border border-[var(--rule)] text-[var(--ink-secondary)] py-2.5 text-[13px] font-semibold uppercase tracking-wider hover:bg-[var(--bg-inset)] disabled:opacity-50 transition-colors w-full";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mode tabs */}
      <div className="flex border-b border-[var(--rule)] mb-4">
        {(["camera", "upload"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={[
              "flex-1 py-2 text-[13px] font-semibold uppercase tracking-wider transition-colors",
              mode === m
                ? "border-b-2 border-[var(--accent)] text-[var(--ink-primary)] -mb-px"
                : "text-[var(--ink-tertiary)] hover:text-[var(--ink-secondary)]",
            ].join(" ")}
          >
            {m === "camera" ? "Camera" : "Upload"}
          </button>
        ))}
      </div>

      {/* ── Camera mode ─────────────────────────────────────────────────────── */}
      {mode === "camera" && (
        <>
          <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
            {/* Loading */}
            {cameraState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-canvas)]">
                <div className="w-8 h-8 border-2 border-[var(--rule)] border-t-[var(--accent)] rounded-full animate-spin" />
                <p className="mt-3 text-sm text-[var(--ink-tertiary)]">Initializing camera…</p>
              </div>
            )}

            {/* Permission denied */}
            {cameraState === "denied" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center">
                <svg className="w-12 h-12 text-[var(--status-error)] mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                </svg>
                <p className="text-sm font-semibold text-[var(--status-error)] mb-1">Camera access denied</p>
                <p className="text-xs text-[var(--ink-tertiary)] max-w-xs">{errorMessage}</p>
              </div>
            )}

            {/* Error */}
            {cameraState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center">
                <svg className="w-12 h-12 text-[var(--status-warning)] mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm font-semibold text-[var(--status-warning)] mb-1">Camera unavailable</p>
                <p className="text-xs text-[var(--ink-tertiary)] max-w-xs">{errorMessage}</p>
              </div>
            )}

            {/* Snapped preview */}
            {cameraSnapped && imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Captured photo"
                className="w-full h-full object-cover"
                style={{ borderRadius: 2 }}
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
                "w-full h-full object-cover",
                cameraLive ? "block" : "hidden",
              ].join(" ")}
              style={{ borderRadius: 2 }}
            />

            {/* Face detection overlay */}
            {cameraLive && (
              <FaceOverlay
                videoEl={videoEl}
                onDetectionChange={handleDetectionChange}
                onUnavailable={() => setFaceDetectionAvailable(false)}
              />
            )}

            {/* Countdown overlay */}
            {cameraLive && isStable && (
              <>
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] font-semibold px-3 py-1 uppercase tracking-wider pointer-events-none select-none">
                  Hold still…
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20 overflow-hidden pointer-events-none">
                  <div ref={progressBarRef} className="h-full bg-[var(--status-success)]" style={{ width: "100%" }} />
                </div>
              </>
            )}

            {/* Shutter flash */}
            <div
              className={[
                "absolute inset-0 bg-white pointer-events-none transition-opacity duration-200",
                shutterActive ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          </div>

          {/* Detection status / manual snap fallback */}
          {cameraLive && faceDetectionAvailable && (
            <p className={["mt-2 text-sm text-center", faceDetected ? "text-[var(--status-success)]" : "text-[var(--ink-tertiary)]"].join(" ")}>
              {faceDetected ? "Face detected ✓" : "Position your face in the frame"}
            </p>
          )}
          {cameraLive && !faceDetectionAvailable && (
            <button onClick={handleSnap} className={PRIMARY_BTN} style={{ borderRadius: 2, letterSpacing: "0.08em" }}>
              Take Photo
            </button>
          )}

          {/* Upload status / result */}
          {uploadState === "uploading" && (
            <p className="mt-3 text-sm text-center text-[var(--ink-tertiary)] animate-pulse">{uploadStatus}</p>
          )}
          {uploadState === "error" && (
            <p className="mt-3 text-sm text-center text-[var(--status-error)]">{uploadError}</p>
          )}
          {uploadState === "done" && result && <ResultPanel result={result} />}

          {/* Post-snap action buttons */}
          {cameraSnapped && uploadState !== "done" && (
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleRetake}
                disabled={uploadState === "uploading"}
                className={SECONDARY_BTN}
                style={{ borderRadius: 2, letterSpacing: "0.08em" }}
              >
                Retake
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploadState === "uploading"}
                className={PRIMARY_BTN}
                style={{ borderRadius: 2, letterSpacing: "0.08em" }}
              >
                {uploadState === "uploading" ? "Sending…" : "Send for Analysis"}
              </button>
            </div>
          )}
          {uploadState === "done" && (
            <button
              onClick={handleRetake}
              className={SECONDARY_BTN}
              style={{ borderRadius: 2, letterSpacing: "0.08em" }}
            >
              Start Over
            </button>
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
                "w-full border-2 border-dashed flex flex-col items-center justify-center",
                "py-14 px-6 text-center cursor-pointer transition-colors",
                isDragOver
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--rule)] hover:border-[var(--ink-tertiary)] bg-[var(--bg-canvas)]",
              ].join(" ")}
            >
              <svg className="w-10 h-10 text-[var(--ink-tertiary)] mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-[var(--ink-secondary)]">
                Drag &amp; drop a photo, or{" "}
                <span className="text-[var(--accent)]">browse</span>
              </p>
              <p className="mt-1 text-xs text-[var(--ink-tertiary)]">JPEG, PNG, or WebP · max 5 MB</p>
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
                className="w-full h-full object-cover"
                style={{ borderRadius: 2 }}
              />
            </div>
          )}

          {fileError && (
            <p className="mt-2 text-xs text-[var(--status-error)] text-center">{fileError}</p>
          )}

          {uploadState === "uploading" && (
            <p className="mt-3 text-sm text-center text-[var(--ink-tertiary)] animate-pulse">{uploadStatus}</p>
          )}
          {uploadState === "error" && (
            <p className="mt-3 text-sm text-center text-[var(--status-error)]">{uploadError}</p>
          )}
          {uploadState === "done" && result && <ResultPanel result={result} />}

          {imagePreviewUrl && uploadState !== "done" && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={handleSubmit}
                disabled={uploadState === "uploading"}
                className={PRIMARY_BTN}
                style={{ borderRadius: 2, letterSpacing: "0.08em" }}
              >
                {uploadState === "uploading" ? "Sending…" : "Send for Analysis"}
              </button>
              <button
                onClick={handleChooseDifferent}
                disabled={uploadState === "uploading"}
                className={SECONDARY_BTN}
                style={{ borderRadius: 2, letterSpacing: "0.08em" }}
              >
                Choose Different
              </button>
            </div>
          )}
          {uploadState === "done" && (
            <button
              onClick={() => { handleChooseDifferent(); setUploadState("idle"); setResult(null); setUploadError(null); }}
              className={SECONDARY_BTN}
              style={{ borderRadius: 2, letterSpacing: "0.08em" }}
            >
              Start Over
            </button>
          )}
        </>
      )}

      {/* Hidden canvas used for snapshot rendering */}
      <canvas ref={snapCanvasRef} className="hidden" />
    </>
  );
}
