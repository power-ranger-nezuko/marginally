import client from './client';

export type Provider = 'stripe' | 'shopify';

export interface Connection {
  provider: Provider;
  connected: boolean;
  connectedAt?: string;
  accountId?: string;
}

export const connectionsApi = {
  listConnections: () =>
    client.get<Connection[]>('/connections').then((r) => r.data),

  disconnectConnection: (provider: Provider) =>
    client.delete(`/connections/${provider}`).then((r) => r.data),
};
