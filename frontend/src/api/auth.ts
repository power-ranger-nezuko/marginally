import client from './client';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
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

  logout: (userId: string, refreshToken: string) =>
    client.post('/auth/logout', { userId, refreshToken }).then((r) => r.data),

  refresh: (userId: string, refreshToken: string) =>
    client
      .post<{ accessToken: string }>('/auth/refresh', { userId, refreshToken })
      .then((r) => r.data),

  me: () => client.get<MeResponse>('/auth/me').then((r) => r.data),
};
