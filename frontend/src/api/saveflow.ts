import client from './client';

export type OfferType = 'DISCOUNT' | 'PAUSE' | 'DOWNGRADE';
export type AttemptOutcome = 'SAVED' | 'CHURNED' | 'PENDING';

export interface OfferConfig {
  discountPercent?: number;
  pauseDurationDays?: number;
  targetPlan?: string;
}

export interface SaveOffer {
  id: string;
  type: OfferType;
  configJson: OfferConfig;
  isActive: boolean;
  createdAt: string;
}

export interface CreateOfferDto {
  type: OfferType;
  configJson: OfferConfig;
}

export interface SaveFlowStats {
  savedCount: number;
  churnedCount: number;
  saveRate: number;
  savedMrr: number;
}

export interface SaveAttempt {
  id: string;
  externalCustomerId: string;
  saveOfferId?: string;
  saveOffer?: SaveOffer;
  outcome: AttemptOutcome;
  occurredAt: string;
}

export interface AttemptFilters {
  outcome?: AttemptOutcome;
  page?: number;
  limit?: number;
}

export const saveflowApi = {
  listOffers: () => client.get<SaveOffer[]>('/save-flow/offers').then((r) => r.data),

  createOffer: (dto: CreateOfferDto) =>
    client.post<SaveOffer>('/save-flow/offers', dto).then((r) => r.data),

  updateOffer: (id: string, dto: Partial<CreateOfferDto>) =>
    client.patch<SaveOffer>(`/save-flow/offers/${id}`, dto).then((r) => r.data),

  getStats: () => client.get<SaveFlowStats>('/save-flow/stats').then((r) => r.data),

  listAttempts: (filters?: AttemptFilters) =>
    client
      .get<{ items: SaveAttempt[]; total: number }>('/save-flow/attempts', { params: filters })
      .then((r) => ({ data: r.data.items, total: r.data.total })),
};
