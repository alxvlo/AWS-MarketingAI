import { getToken } from "./auth";

const ANALYTICS_API = (process.env.NEXT_PUBLIC_ANALYTICS_API ?? "").replace(/\/$/, "");

function authedGet<T>(path: string): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return fetch(`${ANALYTICS_API}${path}`, {
    headers: { Authorization: `Basic ${token}` },
  }).then(async r => {
    if (r.status === 401) throw new Error("Session expired");
    if (!r.ok) throw new Error(`Failed (${r.status})`);
    return r.json() as Promise<T>;
  });
}

export interface EmotionsResponse {
  byEmotion?: Record<string, number>;
  total?: number;
  counts?: Record<string, number>;
}
export interface CampaignsResponse {
  totalSent?: number;
  perTemplate?: Record<string, number>;
  total?: number;
  byTemplate?: Record<string, number>;
  earliestSentAt?: string;
  latestSentAt?: string;
}
export interface TrendsResponse {
  days?: Array<{ date: string; counts: Record<string, number> }>;
  trends?: Array<{ date: string; [key: string]: number | string }>;
}

export const fetchEmotions  = () => authedGet<EmotionsResponse>("/emotions");
export const fetchCampaigns = () => authedGet<CampaignsResponse>("/campaigns");
export const fetchTrends    = () => authedGet<TrendsResponse>("/trends");
