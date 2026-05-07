import { getToken } from "./auth";

// CfnOutput from API Gateway includes a trailing slash; strip defensively.
const ADMIN_API = (process.env.NEXT_PUBLIC_ADMIN_API ?? "").replace(/\/$/, "");

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${ADMIN_API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Login failed (${res.status})`);
  }
  return (await res.json()).token as string;
}

export interface SubmissionRow {
  submissionId: string;
  email: string;
  timestamp: string;
  status: string;
  dominantEmotion?: string;
  emotionScores?: Record<string, number>;
  emailSentAt?: string;
  templateUsed?: string;
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

export async function fetchSubmissions(): Promise<SubmissionsResponse> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${ADMIN_API}/admin/submissions`, {
    headers: { Authorization: `Basic ${token}` },
  });
  if (res.status === 401) throw new Error("Session expired");
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}
