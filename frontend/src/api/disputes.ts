import client from './client';

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'WON' | 'LOST' | 'WITHDRAWN';

export interface Dispute {
  id: string;
  stripeDisputeId: string;
  amount: number;
  currency: string;
  status: DisputeStatus;
  evidenceDueBy?: string;
  reason: string;
  customerId: string;
  createdAt: string;
  evidenceBundle?: EvidenceBundle;
}

export interface EvidenceBundle {
  orderData?: string;
  shippingData?: string;
  commsLog?: string;
}

export interface DisputeStats {
  open: number;
  wonCount: number;
  lostCount: number;
  total: number;
  winRate: number;
}

export interface SubmitEvidenceDto {
  orderData?: string;
  shippingData?: string;
  commsLog?: string;
}

export interface DisputeFilters {
  status?: DisputeStatus;
  page?: number;
  limit?: number;
}

export const disputesApi = {
  listDisputes: (filters?: DisputeFilters) =>
    client
      .get<{ items: Dispute[]; total: number }>('/disputes', { params: filters })
      .then((r) => ({ data: r.data.items, total: r.data.total })),

  getDispute: (id: string) =>
    client.get<Dispute>(`/disputes/${id}`).then((r) => r.data),

  submitEvidence: (id: string, dto: SubmitEvidenceDto) =>
    client.post<Dispute>(`/disputes/${id}/evidence`, dto).then((r) => r.data),

  getStats: () => client.get<DisputeStats>('/disputes/stats').then((r) => r.data),
};
