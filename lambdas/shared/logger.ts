export function log(
  level: 'INFO' | 'WARN' | 'ERROR',
  service: string,
  event: string,
  submissionId: string,
  meta?: object,
  durationMs?: number,
): void {
  try {
    const entry: Record<string, unknown> = {
      level,
      service,
      event,
      submissionId,
      timestamp: new Date().toISOString(),
    };
    if (durationMs !== undefined) entry.durationMs = durationMs;
    if (meta !== undefined) entry.meta = meta;
    console.log(JSON.stringify(entry));
  } catch {
    // intentionally swallowed — logger must never throw
  }
}
