import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  invoicesApi,
  InvoiceTemplate,
  CreateTemplateDto,
  GeneratedInvoice,
} from '../api/invoices';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import PageHeader from '../components/ui/PageHeader';

const templateSchema = z.object({
  companyName: z.string().min(1),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color'),
  locale: z.string().min(1),
  showTax: z.boolean(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});
type TemplateForm = z.infer<typeof templateSchema>;

const INVOICE_COLUMNS: ColumnDef<GeneratedInvoice>[] = [
  {
    key: 'stripeInvoiceId',
    header: 'Stripe Invoice',
    render: (r) => (
      <span className="font-mono text-xs text-gray-600">{r.stripeInvoiceId}</span>
    ),
  },
  { key: 'language', header: 'Language', render: (r) => r.language ?? '—' },
  {
    key: 'generatedAt',
    header: 'Generated',
    render: (r) => new Date(r.generatedAt).toLocaleDateString(),
  },
];

function formToDto(values: TemplateForm): CreateTemplateDto {
  return {
    brandingJson: {
      companyName: values.companyName,
      primaryColor: values.primaryColor,
      logoUrl: values.logoUrl || undefined,
    },
    localeSettings: { locale: values.locale },
    taxSettings: { showTax: values.showTax, taxRate: values.taxRate },
  };
}

function tplToForm(tpl: InvoiceTemplate): TemplateForm {
  return {
    companyName: tpl.brandingJson.companyName ?? '',
    logoUrl: tpl.brandingJson.logoUrl ?? '',
    primaryColor: (tpl.brandingJson.primaryColor as string) ?? '#4c6ef5',
    locale: tpl.localeSettings.locale ?? 'en-US',
    showTax: tpl.taxSettings.showTax ?? false,
    taxRate: tpl.taxSettings.taxRate,
  };
}

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplate | null>(null);

  const { data: templates, isLoading: tplLoading } = useQuery({
    queryKey: ['invoices', 'templates'],
    queryFn: invoicesApi.listTemplates,
  });

  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ['invoices', 'generated'],
    queryFn: () => invoicesApi.listGeneratedInvoices(),
  });

  const createTpl = useMutation({
    mutationFn: (dto: CreateTemplateDto) => invoicesApi.createTemplate(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices', 'templates'] });
      setDialogOpen(false);
    },
  });

  const updateTpl = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateTemplateDto> }) =>
      invoicesApi.updateTemplate(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices', 'templates'] });
      setDialogOpen(false);
      setEditingTemplate(null);
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TemplateForm>({
    resolver: zodResolver(templateSchema),
    defaultValues: { primaryColor: '#4c6ef5', locale: 'en-US', showTax: false },
  });

  const openCreate = () => {
    reset({ primaryColor: '#4c6ef5', locale: 'en-US', showTax: false });
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const openEdit = (tpl: InvoiceTemplate) => {
    reset(tplToForm(tpl));
    setEditingTemplate(tpl);
    setDialogOpen(true);
  };

  const onSubmit = (values: TemplateForm) => {
    const dto = formToDto(values);
    if (editingTemplate) {
      updateTpl.mutate({ id: editingTemplate.id, dto });
    } else {
      createTpl.mutate(dto);
    }
  };

  const columns: ColumnDef<GeneratedInvoice>[] = [
    ...INVOICE_COLUMNS,
    {
      key: 'download',
      header: '',
      render: (r) => (
        <button
          onClick={async () => {
            const { url } = await invoicesApi.getDownloadUrl(r.id);
            window.open(url, '_blank');
          }}
          className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
        >
          Download
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Manage templates and generated invoices"
        action={
          <button
            onClick={openCreate}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New Template
          </button>
        }
      />

      {/* Template list */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Templates</h2>
      {tplLoading ? (
        <p className="text-sm text-gray-400">Loading templates…</p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates?.map((tpl) => {
            const color = (tpl.brandingJson.primaryColor as string) ?? '#4c6ef5';
            const company = tpl.brandingJson.companyName ?? 'Template';
            const logo = tpl.brandingJson.logoUrl as string | undefined;
            return (
              <button
                key={tpl.id}
                onClick={() => openEdit(tpl)}
                className="group rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-brand-400 transition-colors"
              >
                <div
                  className="mb-3 flex h-20 items-center justify-center rounded-lg"
                  style={{ backgroundColor: color + '22', border: `2px solid ${color}` }}
                >
                  {logo ? (
                    <img src={logo} alt="logo" className="h-10 object-contain" />
                  ) : (
                    <span className="text-2xl font-bold" style={{ color }}>
                      {company.charAt(0)}
                    </span>
                  )}
                </div>
                <p className="font-medium text-gray-900">{company}</p>
                <p className="text-xs text-gray-500">
                  {tpl.localeSettings.locale ?? 'en-US'}
                  {tpl.isDefault ? ' · Default' : ''}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Generated invoices */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Generated Invoices</h2>
      <DataTable
        columns={columns}
        data={invoicesData?.data ?? []}
        isLoading={invLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No generated invoices yet."
      />

      {/* Template dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="mb-4 text-lg font-semibold">
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </Dialog.Title>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              {[
                { name: 'companyName' as const, label: 'Company Name', placeholder: 'Acme Inc.' },
                { name: 'logoUrl' as const, label: 'Logo URL', placeholder: 'https://…' },
                { name: 'locale' as const, label: 'Locale', placeholder: 'en-US' },
              ].map(({ name, label, placeholder }) => (
                <div key={name}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
                  <input
                    {...register(name)}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {errors[name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[name]?.message}</p>
                  )}
                </div>
              ))}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Primary Color</label>
                <input
                  type="color"
                  {...register('primaryColor')}
                  className="h-9 w-16 cursor-pointer rounded border border-gray-300"
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="showTax" {...register('showTax')} />
                <label htmlFor="showTax" className="text-sm font-medium text-gray-700">
                  Show Tax
                </label>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('taxRate')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createTpl.isPending || updateTpl.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {createTpl.isPending || updateTpl.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
