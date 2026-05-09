"use client";
import { useEffect, useState } from "react";
import { fetchSubmissions, SubmissionsResponse } from "@/lib/adminApi";

function Tile({ eyebrow, value, accent = false }: { eyebrow: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--rule)] px-5 py-4" style={{ borderRadius: 2 }}>
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <p className="display numeric text-[34px] leading-none" style={{ color: accent ? "var(--accent)" : "var(--ink-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export default function KpiStrip() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchSubmissions(ac.signal).then(setData).catch(e => {
      if (ac.signal.aborted) return;
      setErr((e as Error).message);
    });
    return () => ac.abort();
  }, []);

  if (err) return <div className="col-span-12 text-[13px]" style={{ color: "var(--status-error)" }}>{err}</div>;
  if (!data) return <div className="col-span-12 eyebrow">Loading metrics…</div>;

  const top = Object.entries(data.analytics.byEmotion).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return (
    <>
      <div className="col-span-3"><Tile eyebrow="Total submissions" value={data.analytics.total} /></div>
      <div className="col-span-3"><Tile eyebrow="Emails sent"       value={data.analytics.emailSentCount} /></div>
      <div className="col-span-3"><Tile eyebrow="Email failures"    value={data.analytics.emailFailedCount} /></div>
      <div className="col-span-3"><Tile eyebrow="Top emotion"       value={top} accent /></div>
    </>
  );
}
