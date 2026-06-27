import client from './client';

export type AccountingProvider = 'quickbooks' | 'xero';
export type SyncEntryStatus = 'SYNCED' | 'PENDING' | 'FAILED';

export interface AccountingConnection {
  provider: AccountingProvider;
  connected: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
}

export interface SyncEntry {
  id: string;
  stripeTxnId: string;
  accountingEntryId?: string;
  status: SyncEntryStatus;
  errorMessage?: string;
  syncedAt?: string;
}

export interface ReconciliationReport {
  totalTransactions: number;
  synced: number;
  pending: number;
  failed: number;
  generatedAt: string;
}

export interface SyncFilters {
  status?: SyncEntryStatus;
  page?: number;
  limit?: number;
}

export const accountingApi = {
  listConnections: () =>
    client.get<AccountingConnection[]>('/accounting/connections').then((r) => r.data),

  disconnectAccounting: (provider: AccountingProvider) =>
    client.delete(`/accounting/connections/${provider}`).then((r) => r.data),

  getSyncStatus: (filters?: SyncFilters) =>
    client
      .get<{ data: SyncEntry[]; total: number }>('/accounting/sync', { params: filters })
      .then((r) => r.data),

  triggerSync: () => client.post('/accounting/sync/trigger').then((r) => r.data),

  getReconciliationReport: () =>
    client.get<ReconciliationReport>('/accounting/reconciliation').then((r) => r.data),
};
