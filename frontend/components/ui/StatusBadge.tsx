const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending:          { label: "Pending",          fg: "var(--ink-secondary)", bg: "var(--bg-inset)" },
  emotion_detected: { label: "Emotion Detected", fg: "var(--status-info)",   bg: "rgba(44,87,120,0.1)" },
  email_sent:       { label: "Email Sent",       fg: "var(--status-success)", bg: "rgba(47,107,61,0.1)" },
  email_failed:     { label: "Email Failed",     fg: "var(--status-error)",   bg: "rgba(145,51,33,0.1)" },
  no_face_detected: { label: "No Face",          fg: "var(--status-warning)", bg: "rgba(160,107,31,0.1)" },
  invalid_file:     { label: "Invalid File",     fg: "var(--status-warning)", bg: "rgba(160,107,31,0.1)" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, fg: "var(--ink-secondary)", bg: "var(--bg-inset)" };
  return (
    <span
      className="inline-block px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: s.fg, backgroundColor: s.bg, borderRadius: 2 }}
    >
      {s.label}
    </span>
  );
}
