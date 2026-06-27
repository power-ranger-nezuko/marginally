import client from './client';

export const demoApi = {
  resetDemo: () => client.post('/demo/reset').then((r) => r.data),
  getScenario: (name: string) =>
    client.get(`/demo/scenario/${name}`).then((r) => r.data),
  simulate: (scenario: string) =>
    client.post(`/demo/simulate/${scenario}`).then((r) => r.data),
};
