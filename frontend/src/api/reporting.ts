import client from './client';

export interface DunningReport {
  period: number;
  recovered: number;
  recoveredCount: number;
  trend: number | null;
  dailyRecoveries: { date: string; amount: number; count: number }[];
  topFailureReasons: { reason: string; count: number }[];
}

export interface SaveFlowOfferStat {
  offerId: string;
  type: string;
  attempts: number;
  saved: number;
  acceptanceRate: number;
}

export interface SaveFlowReport {
  period: number;
  totalAttempts: number;
  saved: number;
  saveRate: number;
  saveRateTrend: number | null;
  byOffer: SaveFlowOfferStat[];
}

export interface WebhookStats {
  period: string;
  total: number;
  processed: number;
  failed: number;
  processing: number;
  successRate: number;
  byProvider: { provider: string; count: number }[];
}

export const reportingApi = {
  getDunningReport: (days = 30) =>
    client.get<DunningReport>('/dunning/report', { params: { days } }).then((r) => r.data),

  getSaveFlowReport: () =>
    client.get<SaveFlowReport>('/save-flow/report').then((r) => r.data),

  getWebhookStats: () =>
    client.get<WebhookStats>('/webhooks/stats').then((r) => r.data),
};
