export interface EmotionData {
  happy: number;
  neutral: number;
  sad: number;
  surprised: number;
  angry: number;
  calm: number;
}

export type EmotionKey = keyof EmotionData;

export interface TrendDataPoint {
  date: string;
  happy: number;
  neutral: number;
  sad: number;
  surprised: number;
  angry: number;
}

export interface CampaignData {
  template: string;
  emailsSent: number;
  lastSent: string;
}

export const mockEmotions: EmotionData = {
  happy: 42,
  neutral: 28,
  sad: 15,
  surprised: 9,
  angry: 4,
  calm: 2,
};

export const mockTrends: TrendDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
  happy: Math.floor(Math.random() * 10 + 2),
  neutral: Math.floor(Math.random() * 8 + 1),
  sad: Math.floor(Math.random() * 5),
  surprised: Math.floor(Math.random() * 4),
  angry: Math.floor(Math.random() * 3),
}));

export const mockCampaigns: CampaignData[] = [
  { template: "happy", emailsSent: 42, lastSent: "2026-04-30" },
  { template: "neutral", emailsSent: 28, lastSent: "2026-04-30" },
  { template: "sad", emailsSent: 15, lastSent: "2026-04-29" },
  { template: "surprised", emailsSent: 9, lastSent: "2026-04-28" },
  { template: "angry", emailsSent: 4, lastSent: "2026-04-27" },
  { template: "calm", emailsSent: 2, lastSent: "2026-04-26" },
];
