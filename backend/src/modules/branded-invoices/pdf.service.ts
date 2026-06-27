import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import puppeteer from 'puppeteer-core';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION', 'us-east-1') });
    this.bucket = config.get<string>('S3_BUCKET', 'marginly-invoices');
  }

  async generateInvoicePdf(
    templateId: string,
    brandingJson: Record<string, unknown>,
    stripeInvoiceData: Record<string, unknown>,
    tenantId: string,
    stripeInvoiceId: string,
  ): Promise<{ buffer: Buffer; s3Key: string }> {
    const html = this.buildHtml(brandingJson, stripeInvoiceData);

    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ||
        '/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let buffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      buffer = Buffer.from(pdf);
    } finally {
      await browser.close();
    }

    const s3Key = `invoices/${tenantId}/${stripeInvoiceId}.pdf`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );

    this.logger.log(`Uploaded invoice PDF: ${s3Key}`);
    return { buffer, s3Key };
  }

  private buildHtml(
    brandingJson: Record<string, unknown>,
    invoice: Record<string, unknown>,
  ): string {
    const logo = (brandingJson.logoUrl as string) ?? '';
    const primaryColor = (brandingJson.primaryColor as string) ?? '#000000';
    const fontFamily = (brandingJson.fontFamily as string) ?? 'Arial, sans-serif';

    const invoiceLines = invoice.lines as any;
    const lines: Array<{ description: string; amount: number }> =
      Array.isArray(invoiceLines?.data) ? invoiceLines.data : [];

    const lineRows = lines
      .map(
        (l) =>
          `<tr><td>${l.description ?? ''}</td><td style="text-align:right">$${((l.amount ?? 0) / 100).toFixed(2)}</td></tr>`,
      )
      .join('');

    const total = (invoice.amount_due as number) ?? 0;
    const customerName =
      (invoice as any).customer_name ?? (invoice as any).customer_email ?? '';
    const invoiceNumber = (invoice.number as string) ?? '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${fontFamily}; margin: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; }
    .logo { max-height: 60px; }
    h1 { color: ${primaryColor}; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: ${primaryColor}; color: #fff; padding: 8px; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #eee; }
    .total { font-size: 1.2em; font-weight: bold; text-align: right; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    ${logo ? `<img src="${logo}" class="logo" alt="logo"/>` : '<div></div>'}
    <div>
      <h1>Invoice</h1>
      <p>${invoiceNumber}</p>
    </div>
  </div>
  <p><strong>Bill To:</strong> ${customerName}</p>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="total">Total: $${(total / 100).toFixed(2)}</div>
</body>
</html>`;
  }
}
