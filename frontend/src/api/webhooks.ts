import client from './client';

export type WebhookStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
export type AlertChannel = 'email' | 'slack';

export interface WebhookEvent {
  id: string;
  provider: 'stripe' | 'shopify';
  eventType: string;
  status: WebhookStatus;
  receivedAt: string;
  payload?: unknown;
}

export interface AlertRule {
  id: string;
  name: string;
  conditionJson: Record<string, unknown>;
  notificationChannel: AlertChannel;
  notificationTarget: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateAlertRuleDto {
  name: string;
  conditionJson: Record<string, unknown>;
  notificationChannel: AlertChannel;
  notificationTarget: string;
}

export interface EventFilters {
  provider?: 'stripe' | 'shopify';
  status?: WebhookStatus;
  eventType?: string;
  page?: number;
  limit?: number;
}

export const webhooksApi = {
  listEvents: (filters?: EventFilters) =>
    client
      .get<{ items: WebhookEvent[]; total: number }>('/webhooks/events', { params: filters })
      .then((r) => ({ data: r.data.items, total: r.data.total })),

  replayEvent: (id: string) =>
    client.post<WebhookEvent>(`/webhooks/events/${id}/replay`).then((r) => r.data),

  listAlertRules: () =>
    client.get<AlertRule[]>('/webhooks/alert-rules').then((r) => r.data),

  createAlertRule: (dto: CreateAlertRuleDto) =>
    client.post<AlertRule>('/webhooks/alert-rules', dto).then((r) => r.data),

  deleteAlertRule: (id: string) =>
    client.delete(`/webhooks/alert-rules/${id}`).then((r) => r.data),
};
