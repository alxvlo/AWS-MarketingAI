"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchEmotions, EmotionsResponse } from "@/lib/analytics";

const SWATCH: Record<string, string> = {
  happy:     "var(--emotion-happy)",
  surprised: "var(--emotion-surprised)",
  neutral:   "var(--emotion-neutral)",
  calm:      "var(--emotion-calm)",
  sad:       "var(--emotion-sad)",
  angry:     "var(--emotion-angry)",
};

export default function EmotionDistributionCard() {
  const [data, setData] = useState<EmotionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchEmotions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  return (
    <Card eyebrow="Emotion mix" title="Distribution">
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        <ul className="space-y-3">
          {Object.entries(data.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([emotion, n]) => {
              const pct = data.total > 0 ? (n / data.total) * 100 : 0;
              return (
                <li key={emotion}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[13px] capitalize">{emotion}</span>
                    <span className="numeric text-[12px] text-[var(--ink-tertiary)]">{n} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-inset)]">
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: SWATCH[emotion.toLowerCase()] ?? "var(--ink-secondary)" }} />
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </Card>
  );
}
