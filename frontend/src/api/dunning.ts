import client from './client';

export type PaymentStatus = 'PENDING' | 'RECOVERING' | 'RECOVERED' | 'WRITTEN_OFF';

export interface FailedPayment {
  id: string;
  stripeInvoiceId: string;
  stripeCustomerId: string;
  amount: number;
  status: PaymentStatus;
  retryCount: number;
  nextRetryAt?: string;
  failureReason?: string;
  createdAt: string;
}

export interface DunningStats {
  totalRecovered: number;
  totalWrittenOff: number;
  activeRecovering: number;
  successRate: number;
}

export interface SequenceStep {
  delayDays: number;
  channel: 'email' | 'sms';
  subject?: string;
  message?: string;
}

export interface Sequence {
  id: string;
  name: string;
  isDefault: boolean;
  stepsJson: SequenceStep[];
  createdAt: string;
}

export interface CreateSequenceDto {
  name: string;
  steps: SequenceStep[];
  isDefault?: boolean;
}

export interface FailedPaymentFilters {
  status?: PaymentStatus;
  page?: number;
  limit?: number;
}

export const dunningApi = {
  listFailedPayments: (filters?: FailedPaymentFilters) =>
    client
      .get<{ items: FailedPayment[]; total: number }>('/dunning/failed-payments', { params: filters })
      .then((r) => ({ data: r.data.items, total: r.data.total })),

  getStats: () => client.get<DunningStats>('/dunning/stats').then((r) => r.data),

  listSequences: () =>
    client.get<Sequence[]>('/dunning/recovery-sequences').then((r) => r.data),

  createSequence: (dto: CreateSequenceDto) =>
    client.post<Sequence>('/dunning/recovery-sequences', dto).then((r) => r.data),

  updateSequence: (id: string, dto: Partial<CreateSequenceDto>) =>
    client.patch<Sequence>(`/dunning/recovery-sequences/${id}`, dto).then((r) => r.data),
};
