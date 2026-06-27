import client from './client';

export interface Tenant {
  id: string;
  name: string;
  plan: 'FREE' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  stripeConnected: boolean;
  shopifyConnected: boolean;
}

export const tenantsApi = {
  getTenant: () => client.get<Tenant>('/tenants/me').then((r) => r.data),

  updatePlan: (plan: Tenant['plan']) =>
    client.patch<Tenant>('/tenants/me/plan', { plan }).then((r) => r.data),
};
