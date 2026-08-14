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
          <input id="email" type="email" required autoComplete="email" placeholder="alexvelo199@gmail.com"
            aria-describedby="email-delivery-notice"
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
            style={{ borderRadius: 2 }} />
          <p
            id="email-delivery-notice"
            role="note"
            className="mt-2 border-l-2 border-[var(--status-warning)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-secondary)]"
          >
            <strong>Email demo limitation:</strong> AWS has not approved production access for this website, so Amazon SES remains in sandbox mode. Email delivery only works for the verified address <strong>alexvelo199@gmail.com</strong>; other addresses will not receive an email.
          </p>
        </div>
        <WebcamFeed email={email} />
      </div>
    </Card>
  );
}
