import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import { cleanDatabase, seedTenant, seedUser } from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader } from '../src/test-utils/auth-helpers';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Branded invoices E2E', () => {
  let app: INestApplication;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const tenant = await seedTenant(prisma);
    tenantId = tenant.id;
    const { user, password } = await seedUser(prisma, tenantId, 'OWNER');
    token = await loginAs(app, user.email, password);
  });

  it('POST /invoices/templates creates a template', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/templates')
      .set(getAuthHeader(token))
      .send({
        brandingJson: {
          logo: 'https://cdn.example.com/logo.png',
          primaryColor: '#3B82F6',
          companyName: 'Acme Corp',
        },
        localeSettings: { timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY' },
        taxSettings: { vatRate: 0.2, vatNumber: 'GB123456789' },
        isDefault: true,
      })
      .expect(201);

    expect(res.body).toMatchObject({ tenantId, isDefault: true });
    expect(res.body.id).toBeDefined();

    const template = await prisma.invoiceTemplate.findUnique({ where: { id: res.body.id } });
    expect(template).not.toBeNull();
    expect(template!.tenantId).toBe(tenantId);
  });

  it('GET /invoices/templates returns only this tenant templates', async () => {
    // Create a template for this tenant
    await prisma.invoiceTemplate.create({
      data: {
        tenantId,
        brandingJson: { logo: 'https://example.com/logo.png' },
        isDefault: true,
      },
    });

    // Create a template for another tenant
    const otherTenant = await seedTenant(prisma, { name: 'Other Corp' });
    await prisma.invoiceTemplate.create({
      data: {
        tenantId: otherTenant.id,
        brandingJson: { logo: 'https://other.com/logo.png' },
        isDefault: true,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices/templates')
      .set(getAuthHeader(token))
      .expect(200);

    const templates: { tenantId: string }[] = res.body.data ?? res.body;
    expect(templates.length).toBe(1);
    expect(templates[0].tenantId).toBe(tenantId);
  });

  it('PUT /invoices/templates/:id updates template fields', async () => {
    const template = await prisma.invoiceTemplate.create({
      data: {
        tenantId,
        brandingJson: { logo: 'https://old.com/logo.png', primaryColor: '#000000' },
        isDefault: false,
      },
    });

    const res = await request(app.getHttpServer())
      .put(`/api/v1/invoices/templates/${template.id}`)
      .set(getAuthHeader(token))
      .send({
        brandingJson: { logo: 'https://new.com/logo.png', primaryColor: '#FFFFFF' },
        isDefault: true,
      })
      .expect(200);

    expect(res.body.isDefault).toBe(true);
    expect((res.body.brandingJson as { primaryColor: string }).primaryColor).toBe('#FFFFFF');

    const updated = await prisma.invoiceTemplate.findUnique({ where: { id: template.id } });
    expect(updated!.isDefault).toBe(true);
  });

  it('DELETE /invoices/templates/:id removes template', async () => {
    const template = await prisma.invoiceTemplate.create({
      data: {
        tenantId,
        brandingJson: { logo: 'https://example.com/logo.png' },
        isDefault: false,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/invoices/templates/${template.id}`)
      .set(getAuthHeader(token))
      .expect(200);

    const deleted = await prisma.invoiceTemplate.findUnique({ where: { id: template.id } });
    expect(deleted).toBeNull();
  });

  it('GET /invoices/generated/:id/download for another tenant invoice returns 403', async () => {
    const otherTenant = await seedTenant(prisma, { name: 'Rival Corp' });
    const template = await prisma.invoiceTemplate.create({
      data: {
        tenantId: otherTenant.id,
        brandingJson: { logo: 'https://rival.com/logo.png' },
        isDefault: true,
      },
    });
    const invoice = await prisma.generatedInvoice.create({
      data: {
        tenantId: otherTenant.id,
        templateId: template.id,
        stripeInvoiceId: `in_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
        language: 'en',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/generated/${invoice.id}/download`)
      .set(getAuthHeader(token));

    expect([403, 404]).toContain(res.status);
  });

  it('GET /invoices/templates for unauthenticated request returns 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/invoices/templates')
      .expect(401);
  });
});
