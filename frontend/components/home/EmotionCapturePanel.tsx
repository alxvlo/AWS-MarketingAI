"use client";
import { useState } from "react";
import Card from "@/components/ui/Card";
import WebcamFeed from "@/components/WebcamFeed";

export default function EmotionCapturePanel() {
  const [email, setEmail] = useState("");
  return (
    <Card eyebrow="Live capture" title="Emotion Detection">
      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="eyebrow block mb-1.5">
            Recipient email <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <input id="email" type="email" required autoComplete="email" placeholder="recipient@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
            style={{ borderRadius: 2 }} />
          <p className="mt-1.5 text-[12px] text-[var(--ink-tertiary)]">
            Until SES production access lands, use a verified address (alexvelo199@gmail.com).
          </p>
        </div>
        <WebcamFeed email={email} />
      </div>
    </Card>
  );
}
