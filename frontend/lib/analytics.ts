import { getToken } from "./auth";

const ANALYTICS_API = (process.env.NEXT_PUBLIC_ANALYTICS_API ?? "").replace(/\/$/, "");

function authedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return fetch(`${ANALYTICS_API}${path}`, {
    headers: { Authorization: `Basic ${token}` },
    signal,
  }).then(async r => {
    if (r.status === 401) throw new Error("Session expired");
    if (!r.ok) throw new Error(`Failed (${r.status})`);
    return r.json() as Promise<T>;
  });
}

export interface EmotionsResponse {
  counts: Record<string, number>;
  total: number;
}
export interface CampaignsResponse {
  totalSent: number;
  perTemplate: Record<string, number>;
  earliestSentAt?: string;
  latestSentAt?: string;
}
export type TrendsResponse = Array<{ date: string; counts: Record<string, number> }>;

export const fetchEmotions  = (signal?: AbortSignal) => authedGet<EmotionsResponse>("/emotions", signal);
export const fetchCampaigns = (signal?: AbortSignal) => authedGet<CampaignsResponse>("/campaigns", signal);
export const fetchTrends    = (signal?: AbortSignal) => authedGet<TrendsResponse>("/trends", signal);
