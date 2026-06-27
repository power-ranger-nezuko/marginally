const MOCK_INVOICES = [
  { id: 'INV-2024-0042', customer: 'Acme Coffee Co.', amount: '$15.23', date: '2024-06-01' },
  { id: 'INV-2024-0041', customer: 'Brew & Bean', amount: '$42.00', date: '2024-06-01' },
  { id: 'INV-2024-0040', customer: 'Morning Roast', amount: '$27.50', date: '2024-05-28' },
  { id: 'INV-2024-0039', customer: 'The Coffee Loft', amount: '$89.99', date: '2024-05-25' },
  { id: 'INV-2024-0038', customer: 'Espresso Republic', amount: '$13.75', date: '2024-05-22' },
];

function StripeDefaultInvoice() {
  return (
    <div className="rounded border border-gray-200 bg-white p-4 font-sans text-xs text-gray-800">
      <p className="mb-2 text-base font-bold text-gray-900">Invoice</p>
      <p className="text-gray-500">From: Acme Coffee Co.</p>
      <p className="text-gray-500">To: Customer</p>
      <div className="my-3 border-t border-dashed" />
      <div className="flex justify-between">
        <span>Item 1</span>
        <span>$14.00</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>$1.23</span>
      </div>
      <div className="my-2 border-t" />
      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>$15.23</span>
      </div>
    </div>
  );
}

function MarginallyBrandedInvoice() {
  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white text-xs">
      {/* Brown header */}
      <div className="bg-[#6F4E37] px-4 py-3 text-white">
        <p className="text-sm font-bold tracking-widest">ACME COFFEE</p>
        <p className="text-[10px] opacity-80">Specialty Coffee Roasters</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="font-bold text-gray-900">INVOICE #INV-2024-0042</p>
            <p className="text-gray-500">Date: June 1, 2024</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            PAID
          </span>
        </div>
        <div className="border-t pt-2 text-[11px]">
          <div className="flex justify-between py-1">
            <span>Ethiopian Yirgacheffe 250g x1</span>
            <span>$14.00</span>
          </div>
          <div className="flex justify-between py-1 text-gray-500">
            <span>Monthly Subscription Discount</span>
            <span>-$0.00</span>
          </div>
          <div className="flex justify-between py-1 text-gray-500">
            <span>Subtax</span>
            <span>$1.23</span>
          </div>
          <div className="flex justify-between border-t py-1 font-bold text-gray-900">
            <span>TOTAL</span>
            <span>$15.23</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DemoInvoices() {
  return (
    <div className="space-y-6">
      {/* Template preview */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          Template Preview
        </h3>
        <MarginallyBrandedInvoice />
      </div>

      {/* Before vs After */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          Before vs After
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">
              Stripe Default
            </p>
            <StripeDefaultInvoice />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">
              Marginly Branded
            </p>
            <MarginallyBrandedInvoice />
          </div>
        </div>
      </div>

      {/* Generated invoices list */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-semibold text-gray-900">Generated Invoices</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {MOCK_INVOICES.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{inv.id}</p>
                <p className="text-xs text-gray-500">
                  {inv.customer} · {inv.date}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {inv.amount}
                </span>
                <div className="group relative">
                  <button
                    disabled
                    className="cursor-not-allowed rounded-lg border px-3 py-1 text-xs text-gray-400"
                  >
                    Download PDF
                  </button>
                  <div className="pointer-events-none absolute bottom-full right-0 mb-1 hidden whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block">
                    Available in full account
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
