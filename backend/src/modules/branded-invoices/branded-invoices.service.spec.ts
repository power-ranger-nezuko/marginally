import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrandedInvoicesService } from './branded-invoices.service';
import { PdfService } from './pdf.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    invoices: { retrieve: jest.fn() },
  })),
}));

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('BrandedInvoicesService', () => {
  let service: BrandedInvoicesService;
  let prisma: jest.Mocked<PrismaService>;
  let pdfService: jest.Mocked<PdfService>;

  const fakePrisma = {
    invoiceTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    generatedInvoice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandedInvoicesService,
        { provide: PrismaService, useValue: fakePrisma },
        {
          provide: PdfService,
          useValue: { generateInvoicePdf: jest.fn().mockResolvedValue({ buffer: Buffer.from(''), s3Key: 'invoices/t1/inv1.pdf' }) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-value') },
        },
      ],
    }).compile();

    service = module.get(BrandedInvoicesService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    pdfService = module.get(PdfService) as jest.Mocked<PdfService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTemplate', () => {
    it('throws NotFoundException when template belongs to different tenant', async () => {
      (fakePrisma.invoiceTemplate.findUnique as jest.Mock).mockResolvedValue({
        id: 'tmpl1',
        tenantId: 'tenant-B',
      });

      await expect(service.getTemplate('tenant-A', 'tmpl1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when template does not exist', async () => {
      (fakePrisma.invoiceTemplate.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getTemplate('tenant-A', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns template when tenantId matches', async () => {
      const template = { id: 'tmpl1', tenantId: 'tenant-A' };
      (fakePrisma.invoiceTemplate.findUnique as jest.Mock).mockResolvedValue(template);

      const result = await service.getTemplate('tenant-A', 'tmpl1');
      expect(result).toEqual(template);
    });
  });

  describe('getSignedDownloadUrl', () => {
    it('throws ForbiddenException when invoice belongs to different tenant', async () => {
      (fakePrisma.generatedInvoice.findUnique as jest.Mock).mockResolvedValue({
        id: 'inv1',
        tenantId: 'tenant-B',
        pdfS3Key: 'invoices/tenant-B/inv.pdf',
      });

      await expect(service.getSignedDownloadUrl('tenant-A', 'inv1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when invoice not found', async () => {
      (fakePrisma.generatedInvoice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getSignedDownloadUrl('tenant-A', 'inv1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when pdfS3Key is null', async () => {
      (fakePrisma.generatedInvoice.findUnique as jest.Mock).mockResolvedValue({
        id: 'inv1',
        tenantId: 'tenant-A',
        pdfS3Key: null,
      });

      await expect(service.getSignedDownloadUrl('tenant-A', 'inv1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns signed URL for valid invoice', async () => {
      (fakePrisma.generatedInvoice.findUnique as jest.Mock).mockResolvedValue({
        id: 'inv1',
        tenantId: 'tenant-A',
        pdfS3Key: 'invoices/tenant-A/inv.pdf',
      });
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');

      const result = await service.getSignedDownloadUrl('tenant-A', 'inv1');
      expect(result.url).toBe('https://s3.example.com/presigned');
    });
  });
});
