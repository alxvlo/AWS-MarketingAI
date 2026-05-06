"use client";

import { useCallback, useEffect, useState } from "react";

interface Submission {
  submissionId: string;
  email: string;
  timestamp: string;
  status: string;
  dominantEmotion?: string;
  emotionScores?: Record<string, number>;
  emailSentAt?: string;
  templateUsed?: string;
}

interface Analytics {
  total: number;
  byEmotion: Record<string, number>;
  emailSentCount: number;
  emailFailedCount: number;
}

interface AdminData {
  submissions: Submission[];
  analytics: Analytics;
}

type LoadState = "loading" | "ready" | "error";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:          { label: "Pending",          className: "bg-slate-600 text-slate-200" },
  emotion_detected: { label: "Emotion Detected", className: "bg-blue-700 text-blue-100" },
  email_sent:       { label: "Email Sent",        className: "bg-green-700 text-green-100" },
  email_failed:     { label: "Email Failed",      className: "bg-red-700 text-red-100" },
  no_face_detected: { label: "No Face",           className: "bg-amber-700 text-amber-100" },
  invalid_file:     { label: "Invalid File",      className: "bg-orange-700 text-orange-100" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? { label: status, className: "bg-slate-600 text-slate-200" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminAuditPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<AdminData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = useCallback(async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/submissions");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AdminData;
      setData(json);
      setState("ready");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState("error");
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700/60 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Satisfaction Meter</h1>
          <p className="text-xs text-slate-400 mt-0.5">Audit Trail</p>
        </div>
        <button
          onClick={fetchData}
          disabled={state === "loading"}
          className="rounded-lg border border-slate-600 px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {state === "loading" ? "Loading…" : "Refresh"}
        </button>
      </header>

      <main className="px-6 py-6 space-y-6 max-w-7xl mx-auto">

        {/* Loading state */}
        {state === "loading" && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="rounded-xl bg-red-900/40 border border-red-700/60 px-5 py-4 text-sm text-red-300">
            Failed to load submissions. {errorMsg && <span className="opacity-75">({errorMsg})</span>}
          </div>
        )}

        {state === "ready" && data && (
          <>
            {/* Analytics bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-xl p-4 shadow">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Submissions</p>
                <p className="text-3xl font-bold text-white mt-1">{data.analytics.total}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 shadow">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Emails Sent</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{data.analytics.emailSentCount}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 shadow">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Email Failed</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{data.analytics.emailFailedCount}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 shadow">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Emotion Breakdown</p>
                {Object.keys(data.analytics.byEmotion).length === 0 ? (
                  <p className="text-sm text-slate-500">No data</p>
                ) : (
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {Object.entries(data.analytics.byEmotion)
                      .sort((a, b) => b[1] - a[1])
                      .map(([emotion, count]) => (
                        <span key={emotion} className="inline-block mr-2">
                          <span className="capitalize">{emotion}</span>
                          <span className="text-slate-500">: </span>
                          <span className="font-semibold text-white">{count}</span>
                        </span>
                      ))}
                  </p>
                )}
              </div>
            </div>

            {/* Audit table */}
            <div className="bg-slate-800 rounded-xl shadow overflow-x-auto">
              {data.submissions.length === 0 ? (
                <div className="px-6 py-16 text-center text-slate-500 text-sm">
                  No submissions yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60">
                      {["Submission ID", "Time", "Email", "Status", "Emotion", "Template", "Email Sent At"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.submissions.map(sub => (
                      <tr key={sub.submissionId} className="border-b border-slate-700/40 last:border-0 hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-300 text-xs">
                          {sub.submissionId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap text-xs">
                          {formatTime(sub.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {sub.email}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={sub.status} />
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-300 text-xs">
                          {sub.dominantEmotion ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {sub.templateUsed ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                          {sub.emailSentAt ? formatTime(sub.emailSentAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
