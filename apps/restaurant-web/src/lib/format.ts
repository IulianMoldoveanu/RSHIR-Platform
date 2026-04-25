const ronFormatter = new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'RON',
  maximumFractionDigits: 2,
});

export function formatRon(amount: number): string {
  return ronFormatter.format(amount);
}
