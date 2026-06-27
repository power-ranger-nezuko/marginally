import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import { cleanDatabase, seedTenant, seedUser } from '../src/test-utils/db-helpers';
import { loginAs, makeFakeJwt, getAuthHeader } from '../src/test-utils/auth-helpers';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Authentication E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('POST /api/v1/auth/signup creates tenant + user + returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        tenantName: 'Acme Inc',
        email: 'alice@acme.com',
        password: 'SecurePassword123!',
      })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toMatchObject({ email: 'alice@acme.com' });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const tenant = await prisma.tenant.findFirst({ where: { name: 'Acme Inc' } });
    expect(tenant).not.toBeNull();

    const user = await prisma.user.findFirst({ where: { email: 'alice@acme.com' } });
    expect(user).not.toBeNull();
    expect(user!.tenantId).toBe(tenant!.id);
  });

  it('POST /api/v1/auth/login returns accessToken and sets refreshToken cookie', async () => {
    const tenant = await seedTenant(prisma);
    const { user, password } = await seedUser(prisma, tenant.id, 'OWNER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');

    const cookies: string[] = res.headers['set-cookie'] ?? [];
    const hasRefreshCookie = cookies.some((c: string) => c.startsWith('refreshToken='));
    expect(hasRefreshCookie).toBe(true);
    // Ensure HttpOnly is set on the refresh token cookie
    const refreshCookie = cookies.find((c: string) => c.startsWith('refreshToken=')) ?? '';
    expect(refreshCookie.toLowerCase()).toContain('httponly');
  });

  it('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const tenant = await seedTenant(prisma);
    const { user } = await seedUser(prisma, tenant.id);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword999!' })
      .expect(401);

    expect(res.body.message).toMatch(/invalid credentials|unauthorized/i);
  });

  it('POST /api/v1/auth/login locks account after 10 failed attempts', async () => {
    const tenant = await seedTenant(prisma);
    const { user } = await seedUser(prisma, tenant.id);

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'BadPassword!' });
    }

    // Even with correct password, 11th attempt should be locked
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BadPassword!' })
      .expect(401);

    expect(res.body.message).toMatch(/locked|too many attempts/i);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser!.failedLogins).toBeGreaterThanOrEqual(10);
    expect(updatedUser!.lockedUntil).not.toBeNull();
  });

  it('POST /api/v1/auth/refresh issues new accessToken', async () => {
    const tenant = await seedTenant(prisma);
    const { user, password } = await seedUser(prisma, tenant.id);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const cookies: string[] = loginRes.headers['set-cookie'] ?? [];

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body.accessToken).not.toBe(loginRes.body.accessToken);
  });

  it('POST /api/v1/auth/refresh with used/deleted refresh token returns 401', async () => {
    const tenant = await seedTenant(prisma);
    const { user, password } = await seedUser(prisma, tenant.id);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const cookies: string[] = loginRes.headers['set-cookie'] ?? [];

    // Use the refresh token once successfully
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    // Attempt to use same refresh token again — must be rejected (rotation)
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);

    expect(res.body.message).toMatch(/invalid|expired|token/i);
  });

  it('POST /api/v1/auth/logout invalidates refresh token', async () => {
    const tenant = await seedTenant(prisma);
    const { user, password } = await seedUser(prisma, tenant.id);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const cookies: string[] = loginRes.headers['set-cookie'] ?? [];
    const accessToken = loginRes.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(getAuthHeader(accessToken))
      .set('Cookie', cookies)
      .expect(200);

    // After logout, refresh token must no longer work
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);

    const tokenCount = await prisma.refreshToken.count({ where: { userId: user.id } });
    expect(tokenCount).toBe(0);
  });

  it('GET /api/v1/tenants/:id without JWT returns 401', async () => {
    const tenant = await seedTenant(prisma);

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenant.id}`)
      .expect(401);
  });

  it('GET /api/v1/tenants/:id with JWT from different tenant returns 403', async () => {
    const tenantA = await seedTenant(prisma, { name: 'Tenant A' });
    const tenantB = await seedTenant(prisma, { name: 'Tenant B' });
    const { user: userA, password: passwordA } = await seedUser(prisma, tenantA.id, 'OWNER');

    const token = await loginAs(app, userA.email, passwordA);

    // userA (tenantA) tries to access tenantB's resource
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantB.id}`)
      .set(getAuthHeader(token))
      .expect(403);
  });
});
