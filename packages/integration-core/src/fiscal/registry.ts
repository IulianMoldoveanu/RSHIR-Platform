// Fiscal-adapter registry — country-level invoice dispatch abstraction.
//
// Current state: registry is empty at module load. The existing RO
// SmartBill + e-Factura logic lives in Supabase Edge Functions
// (supabase/functions/smartbill-push, supabase/functions/efactura-test)
// and is not importable here. A future PR can wire a concrete RO adapter
// once the invoice push logic is extracted into a shared package.
//
// Adding a new country = call registerFiscalAdapter(myAdapter) at app
// startup. getFiscalAdapter returns null for unregistered countries so
// callers can decide whether to skip or error.

export type FiscalInvoiceInput = {
  tenantId: string;
  orderId: string;
  totalCents: number;
  currencyCode: string;
  customerVatId?: string;
};

export type FiscalAdapter = {
  countryCode: string;
  name: string;
  pushInvoice(input: FiscalInvoiceInput): Promise<{ id: string; url?: string }>;
  validateVatId?(vatId: string): boolean;
};

const ADAPTERS = new Map<string, FiscalAdapter>();

export function registerFiscalAdapter(adapter: FiscalAdapter): void {
  ADAPTERS.set(adapter.countryCode.toUpperCase(), adapter);
}

export function getFiscalAdapter(countryCode: string): FiscalAdapter | null {
  return ADAPTERS.get(countryCode.toUpperCase()) ?? null;
}

export const FISCAL_COUNTRIES_SUPPORTED = (): string[] => Array.from(ADAPTERS.keys());
