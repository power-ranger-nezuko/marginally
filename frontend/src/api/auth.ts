import client from './client';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    client.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  signup: (tenantName: string, email: string, password: string) =>
    client.post<LoginResponse>('/auth/signup', { tenantName, email, password }).then((r) => r.data),

  logout: () => client.post('/auth/logout').then((r) => r.data),

  refresh: () =>
    client.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),

  me: () => client.get<MeResponse>('/auth/me').then((r) => r.data),
};
