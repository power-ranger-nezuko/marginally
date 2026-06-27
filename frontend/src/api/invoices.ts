import client from './client';

export interface BrandingJson {
  companyName?: string;
  primaryColor?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface LocaleSettings {
  locale?: string;
  [key: string]: unknown;
}

export interface TaxSettings {
  showTax?: boolean;
  taxRate?: number;
  [key: string]: unknown;
}

export interface InvoiceTemplate {
  id: string;
  brandingJson: BrandingJson;
  localeSettings: LocaleSettings;
  taxSettings: TaxSettings;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateTemplateDto {
  brandingJson: BrandingJson;
  localeSettings?: LocaleSettings;
  taxSettings?: TaxSettings;
  isDefault?: boolean;
}

export interface GeneratedInvoice {
  id: string;
  templateId: string;
  stripeInvoiceId: string;
  pdfS3Key?: string;
  language?: string;
  generatedAt: string;
}

export interface InvoiceFilters {
  page?: number;
  limit?: number;
}

export const invoicesApi = {
  listTemplates: () =>
    client.get<InvoiceTemplate[]>('/invoices/templates').then((r) => r.data),

  createTemplate: (dto: CreateTemplateDto) =>
    client.post<InvoiceTemplate>('/invoices/templates', dto).then((r) => r.data),

  updateTemplate: (id: string, dto: Partial<CreateTemplateDto>) =>
    client.put<InvoiceTemplate>(`/invoices/templates/${id}`, dto).then((r) => r.data),

  listGeneratedInvoices: (filters?: InvoiceFilters) =>
    client
      .get<{ items: GeneratedInvoice[]; total: number }>('/invoices/generated', { params: filters })
      .then((r) => ({ data: r.data.items, total: r.data.total })),

  getDownloadUrl: (id: string) =>
    client.get<{ url: string }>(`/invoices/generated/${id}/download`).then((r) => r.data),
};
