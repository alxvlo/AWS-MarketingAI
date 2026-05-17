"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchSubmissions, SubmissionsResponse } from "@/lib/adminApi";

const PAGE_SIZE = 10;

function fmtTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function SubmissionsAuditCard() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setErr(null);
    setPage(1);
    fetchSubmissions().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Audit trail shows every submission that Rekognition successfully analysed
  // — emotion_detected (Phase 1 complete, awaiting user confirm), email_sent
  // (Phase 2 success), and email_failed (Phase 2 send error). Excludes
  // no_face_detected and invalid_file since those have no emotion to audit.
  const visibleSubmissions = useMemo(
    () => (data
      ? data.submissions.filter(s =>
          s.status === "email_sent"
          || s.status === "email_failed"
          || s.status === "emotion_detected"
        )
      : []),
    [data]
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleSubmissions.length / PAGE_SIZE)),
    [visibleSubmissions]
  );
  const pageItems = useMemo(
    () => visibleSubmissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleSubmissions, page]
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
        visibleSubmissions.length === 0 ? (
          <p className="text-[var(--ink-tertiary)] text-[14px]">No emails sent yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[var(--bg-inset)]">
                    {["Submission","Time","Email","Status","Emotion","Sent At"].map(h => (
                      <th key={h} className="text-left px-4 py-2 eyebrow font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(s => (
                    <tr key={s.submissionId} className="border-b border-[var(--rule)] last:border-0">
                      <td className="px-4 py-2 numeric text-[var(--ink-secondary)]">{s.submissionId.slice(0, 8)}…</td>
                      <td className="px-4 py-2 numeric whitespace-nowrap">{fmtTime(s.timestamp)}</td>
                      <td className="px-4 py-2 text-[var(--ink-secondary)]">{s.email}</td>
                      <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-2 capitalize">{s.dominantEmotion ?? "—"}</td>
                      <td className="px-4 py-2 numeric whitespace-nowrap text-[var(--ink-secondary)]">{s.emailSentAt ? fmtTime(s.emailSentAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--rule)] text-[12px]">
              <span className="text-[var(--ink-tertiary)] numeric">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleSubmissions.length)} of {visibleSubmissions.length}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 uppercase tracking-wider font-semibold text-[var(--ink-secondary)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:text-[var(--ink-secondary)] disabled:cursor-not-allowed transition-colors"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Prev
                </button>
                <span className="numeric text-[var(--ink-secondary)]">
                  Page <span className="text-[var(--ink-primary)] font-semibold">{page}</span> of <span className="text-[var(--ink-primary)] font-semibold">{totalPages}</span>
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 uppercase tracking-wider font-semibold text-[var(--ink-secondary)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:text-[var(--ink-secondary)] disabled:cursor-not-allowed transition-colors"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )
      )}
    </Card>
  );
}
