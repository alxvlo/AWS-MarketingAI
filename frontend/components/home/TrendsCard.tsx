"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchTrends, TrendsResponse } from "@/lib/analytics";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const COLOR: Record<string, string> = {
  happy: "#c08a1d", surprised: "#7a4f9b", neutral: "#6e6a64",
  calm: "#3e7d75", sad: "#3d5a78", angry: "#913321",
};

export default function TrendsCard() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchTrends().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  if (err) return <Card eyebrow="30-day trend" title="Trend"><p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p></Card>;
  if (!data) return <Card eyebrow="30-day trend" title="Loading…"><div /></Card>;

  // Flatten Array<{ date, counts }> → [{ date, happy, surprised, ... }]
  const flat = data.map(d => ({ date: d.date, ...d.counts }));
  const emotions = Object.keys(COLOR);

  return (
    <Card eyebrow="30-day trend" title="Submissions over time">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={flat} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" stroke="var(--ink-tertiary)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
            <YAxis stroke="var(--ink-tertiary)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
            <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-tertiary)" }} />
            {emotions.map(em => (
              <Line key={em} type="monotone" dataKey={em} stroke={COLOR[em]} strokeWidth={1.5} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
