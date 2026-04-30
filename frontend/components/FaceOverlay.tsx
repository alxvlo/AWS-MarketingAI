"use client";

import { useEffect, useRef } from "react";

interface FaceOverlayProps {
  videoEl: HTMLVideoElement | null;
  onDetectionChange: (detected: boolean) => void;
}

const MODEL_URL = "/models";
const GREEN = "#22c55e";
const RED = "#ef4444";
const STROKE = 3;

export default function FaceOverlay({ videoEl, onDetectionChange }: FaceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep a ref to the callback so the detection loop never captures a stale closure
  const callbackRef = useRef(onDetectionChange);
  useEffect(() => {
    callbackRef.current = onDetectionChange;
  });

  useEffect(() => {
    if (!videoEl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number | null = null;
    let cancelled = false;

    async function run() {
      // Dynamic import keeps face-api.js out of the SSR bundle
      const faceapi = await import("face-api.js");

      if (!faceapi.nets.tinyFaceDetector.isLoaded) {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      }

      if (cancelled) return;

      async function detect() {
        if (cancelled || !videoEl || !canvas) return;

        // Skip until the video stream is actually playing
        if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
          rafId = requestAnimationFrame(detect);
          return;
        }

        // Sync canvas pixel space to the video's intrinsic resolution once.
        // The canvas is CSS-scaled to fill the container via w-full h-full,
        // so detection box coordinates map directly without manual scaling.
        if (canvas.width !== videoEl.videoWidth) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
        }

        const result = await faceapi.detectSingleFace(
          videoEl,
          new faceapi.TinyFaceDetectorOptions()
        );

        if (cancelled || !canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = STROKE;

        if (result) {
          const { x, y, width, height } = result.box;
          ctx.strokeStyle = GREEN;
          ctx.strokeRect(x, y, width, height);
          callbackRef.current(true);
        } else {
          // Guide frame: 60% wide, 80% tall, centered
          const gx = canvas.width * 0.2;
          const gy = canvas.height * 0.1;
          const gw = canvas.width * 0.6;
          const gh = canvas.height * 0.8;
          ctx.strokeStyle = RED;
          ctx.strokeRect(gx, gy, gw, gh);
          callbackRef.current(false);
        }

        rafId = requestAnimationFrame(detect);
      }

      rafId = requestAnimationFrame(detect);
    }

    run().catch(console.error);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [videoEl]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full rounded-xl pointer-events-none"
    />
  );
}
