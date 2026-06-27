import client from './client';

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  resource: string;
  createdAt: string;
}

export const auditApi = {
  getRecentLogs: (limit = 10) =>
    client
      .get<{ data: AuditLog[]; total: number }>('/audit-log', {
        params: { limit },
      })
      .then((r) => r.data),
};
