"use client";
import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchSubmissions, SubmissionsResponse } from "@/lib/adminApi";

function fmtTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function SubmissionsAuditCard() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    fetchSubmissions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state asynchronously via .then(); not a sync setState call
  useEffect(() => { load(); }, [load]);

  return (
    <Card
      eyebrow="Audit trail"
      title="Submissions"
      action={
        <button onClick={load}
          className="text-[12px] uppercase tracking-wider font-semibold text-[var(--ink-secondary)] hover:text-[var(--accent)]"
          style={{ letterSpacing: "0.12em" }}>
          Refresh
        </button>
      }>
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        data.submissions.length === 0 ? (
          <p className="text-[var(--ink-tertiary)] text-[14px]">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[var(--bg-inset)]">
                  {["Submission","Time","Email","Status","Emotion","Template","Sent At"].map(h => (
                    <th key={h} className="text-left px-4 py-2 eyebrow font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.submissions.map(s => (
                  <tr key={s.submissionId} className="border-b border-[var(--rule)] last:border-0">
                    <td className="px-4 py-2 numeric text-[var(--ink-secondary)]">{s.submissionId.slice(0, 8)}…</td>
                    <td className="px-4 py-2 numeric whitespace-nowrap">{fmtTime(s.timestamp)}</td>
                    <td className="px-4 py-2 text-[var(--ink-secondary)]">{s.email}</td>
                    <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2 capitalize">{s.dominantEmotion ?? "—"}</td>
                    <td className="px-4 py-2 text-[var(--ink-secondary)]">{s.templateUsed ?? "—"}</td>
                    <td className="px-4 py-2 numeric whitespace-nowrap text-[var(--ink-secondary)]">{s.emailSentAt ? fmtTime(s.emailSentAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  );
}
