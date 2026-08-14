const ANALYTICS_API = (process.env.NEXT_PUBLIC_ANALYTICS_API ?? "").replace(/\/$/, "");

function publicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetch(`${ANALYTICS_API}${path}`, {
    signal,
  }).then(async r => {
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

export const fetchEmotions  = (signal?: AbortSignal) => publicGet<EmotionsResponse>("/emotions", signal);
export const fetchCampaigns = (signal?: AbortSignal) => publicGet<CampaignsResponse>("/campaigns", signal);
export const fetchTrends    = (signal?: AbortSignal) => publicGet<TrendsResponse>("/trends", signal);
