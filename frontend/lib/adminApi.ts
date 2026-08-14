// CfnOutput from API Gateway includes a trailing slash; strip defensively.
const ADMIN_API = (process.env.NEXT_PUBLIC_ADMIN_API ?? "").replace(/\/$/, "");

export interface SubmissionRow {
  displayId: string;
  timestamp: string;
  status: string;
  dominantEmotion?: string;
  emailSentAt?: string;
}

export interface SubmissionsResponse {
  submissions: SubmissionRow[];
  analytics: {
    total: number;
    byEmotion: Record<string, number>;
    emailSentCount: number;
    emailFailedCount: number;
  };
}

export async function fetchSubmissions(signal?: AbortSignal): Promise<SubmissionsResponse> {
  const res = await fetch(`${ADMIN_API}/admin/submissions`, {
    signal,
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}
