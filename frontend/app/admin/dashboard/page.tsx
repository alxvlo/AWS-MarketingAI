"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  mockEmotions,
  mockTrends,
  mockCampaigns,
  type EmotionKey,
  type TrendDataPoint,
} from "@/lib/mockAnalytics";

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = "overview" | "emotions" | "campaigns" | "trends";

interface TrendWithAvg extends TrendDataPoint {
  total: number;
  avg: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMOTION_COLORS: Record<EmotionKey, string> = {
  happy: "#22c55e",
  neutral: "#94a3b8",
  sad: "#3b82f6",
  surprised: "#f59e0b",
  angry: "#ef4444",
  calm: "#8b5cf6",
};

// Emotions present in trend data (calm is tracked in totals only)
const TREND_KEYS = ["happy", "neutral", "sad", "surprised", "angry"] as const;
type TrendKey = (typeof TREND_KEYS)[number];

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "#1e293b",
  border: "1px solid #475569",
  borderRadius: "8px",
};

const TICK_STYLE = { fill: "#94a3b8", fontSize: 12 };

// ── Derived data (computed once from mock constants) ──────────────────────────

const emotionBarData = (Object.entries(mockEmotions) as [EmotionKey, number][]).map(
  ([key, count]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    count,
    key,
  })
);

const trendsWithAvg: TrendWithAvg[] = mockTrends.map((day, i) => {
  const total = TREND_KEYS.reduce<number>((sum, k) => sum + day[k], 0);
  const window = mockTrends.slice(Math.max(0, i - 6), i + 1);
  const windowSum = window.reduce<number>(
    (sum, d) => sum + TREND_KEYS.reduce<number>((s, k) => s + d[k], 0),
    0
  );
  const avg = Math.round((windowSum / window.length) * 10) / 10;
  return { ...day, total, avg };
});

const sortedCampaigns = [...mockCampaigns].sort(
  (a, b) => b.emailsSent - a.emailsSent
);

// Overview stats
const totalSubmissions = Object.values(mockEmotions).reduce((a, b) => a + b, 0);
const mostCommonEmotion = (
  Object.entries(mockEmotions) as [EmotionKey, number][]
).sort((a, b) => b[1] - a[1])[0][0];
const totalEmailsSent = mockCampaigns.reduce((sum, c) => sum + c.emailsSent, 0);
const last7DaysTotal = mockTrends
  .slice(-7)
  .reduce<number>((sum, d) => sum + TREND_KEYS.reduce<number>((s, k) => s + d[k], 0), 0);

// ── Helper ────────────────────────────────────────────────────────────────────

function emotionColor(template: string): string {
  return template in EMOTION_COLORS
    ? EMOTION_COLORS[template as EmotionKey]
    : "#94a3b8";
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "emotions", label: "Emotions" },
  { id: "campaigns", label: "Campaigns" },
  { id: "trends", label: "Trends" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("overview");

  // Auth guard — runs client-side only; server renders a spinner
  useEffect(() => {
    if (!sessionStorage.getItem("admin_authed")) {
      router.replace("/admin");
      return;
    }
    setReady(true);
  }, [router]);

  function handleSignOut() {
    sessionStorage.removeItem("admin_authed");
    router.replace("/admin");
  }

  function handleNav(section: Section) {
    setActiveSection(section);
    setSidebarOpen(false);
  }

  // Show spinner while auth check runs (also prevents recharts SSR issues)
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-800 text-white">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-slate-900 flex flex-col",
          "transform transition-transform duration-200 ease-in-out",
          "lg:relative lg:z-auto lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Brand */}
        <div className="px-6 py-5 border-b border-slate-700/60">
          <p className="text-base font-bold text-white leading-tight">
            Satisfaction Meter
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Admin Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={[
                "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeSection === item.id
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-slate-700/60">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700/60 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white p-1 -ml-1"
            aria-label="Open sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="text-sm font-semibold text-white">
            Satisfaction Meter
          </span>
          <span className="ml-auto text-xs text-slate-400 capitalize">
            {activeSection}
          </span>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── Overview ─────────────────────────────────────────────────── */}
          {activeSection === "overview" && (
            <>
              <h2 className="text-xl font-bold text-white">Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: "Total Submissions", value: totalSubmissions },
                  {
                    label: "Most Common Emotion",
                    value:
                      mostCommonEmotion.charAt(0).toUpperCase() +
                      mostCommonEmotion.slice(1),
                  },
                  { label: "Emails Sent", value: totalEmailsSent },
                  { label: "Last 7 Days", value: last7DaysTotal },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="bg-slate-700 rounded-xl p-5 shadow"
                  >
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      {card.label}
                    </p>
                    <p className="text-3xl font-bold text-white mt-2">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Emotions ─────────────────────────────────────────────────── */}
          {activeSection === "emotions" && (
            <>
              <h2 className="text-xl font-bold text-white">
                Emotion Distribution
              </h2>
              {/* TODO: replace mockEmotions with GET /analytics/emotions */}
              <div className="bg-slate-700 rounded-xl p-5 shadow">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={emotionBarData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#475569"
                      vertical={false}
                    />
                    <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: "#f1f5f9", fontWeight: 600 }}
                      itemStyle={{ color: "#94a3b8" }}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Submissions">
                      {emotionBarData.map((entry) => (
                        <Cell key={entry.key} fill={EMOTION_COLORS[entry.key]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ── Trends ───────────────────────────────────────────────────── */}
          {activeSection === "trends" && (
            <>
              <h2 className="text-xl font-bold text-white">
                Submission Volume — Last 30 Days
              </h2>
              {/* TODO: replace mockTrends with GET /analytics/trends */}
              <div className="bg-slate-700 rounded-xl p-5 shadow">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart
                    data={trendsWithAvg}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#475569"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      interval={4}
                      tick={TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: "#f1f5f9", fontWeight: 600 }}
                      itemStyle={{ color: "#94a3b8" }}
                    />
                    <Legend
                      wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 12 }}
                    />
                    {TREND_KEYS.map((key: TrendKey) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={EMOTION_COLORS[key]}
                        dot={false}
                        strokeWidth={1.5}
                        name={key.charAt(0).toUpperCase() + key.slice(1)}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="#ffffff"
                      strokeDasharray="5 5"
                      dot={false}
                      strokeWidth={2}
                      name="Trend (7-day avg)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ── Campaigns ────────────────────────────────────────────────── */}
          {activeSection === "campaigns" && (
            <>
              <h2 className="text-xl font-bold text-white">
                Campaign Performance
              </h2>
              {/* TODO: replace mockCampaigns with GET /analytics/campaigns */}
              <div className="bg-slate-700 rounded-xl shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600/60">
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Template
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Emails Sent ↓
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Last Sent
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCampaigns.map((c) => (
                      <tr
                        key={c.template}
                        className="border-b border-slate-600/40 last:border-0 hover:bg-slate-600/30 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: emotionColor(c.template) }}
                            />
                            <span className="capitalize text-slate-200">
                              {c.template}
                            </span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-white">
                          {c.emailsSent}
                        </td>
                        <td className="px-5 py-3.5 text-slate-300">
                          {c.lastSent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
