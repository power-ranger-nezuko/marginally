import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PdfService } from './pdf.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Mock puppeteer-core
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn(),
        pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
      }),
      close: jest.fn(),
    }),
  },
}));

// Mock S3Client
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: string) => def,
          },
        },
      ],
    }).compile();

    service = module.get(PdfService);
    mockSend.mockClear();
    (PutObjectCommand as unknown as jest.Mock).mockClear();
  });

  it('uploads to S3 with correct key format: invoices/{tenantId}/{stripeInvoiceId}.pdf', async () => {
    const tenantId = 'tenant-123';
    const stripeInvoiceId = 'in_abc456';

    await service.generateInvoicePdf(
      'tmpl1',
      { logoUrl: 'https://example.com/logo.png', primaryColor: '#ff0000' },
      { amount_due: 5000, number: 'INV-001', lines: { data: [] } },
      tenantId,
      stripeInvoiceId,
    );

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: `invoices/${tenantId}/${stripeInvoiceId}.pdf`,
        ContentType: 'application/pdf',
      }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('returns s3Key matching the expected format', async () => {
    const result = await service.generateInvoicePdf(
      'tmpl1',
      {},
      { amount_due: 0, lines: { data: [] } },
      'tenant-abc',
      'in_xyz789',
    );

    expect(result.s3Key).toBe('invoices/tenant-abc/in_xyz789.pdf');
  });
});
