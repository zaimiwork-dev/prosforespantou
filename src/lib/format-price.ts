// Greek price format: «0,83 €», «1.234,50 €», «0,83 €/λίτρο».
// Decimal comma, "." thousands separator from 1.000 up (done by hand: Intl el-GR
// skips grouping for 4-digit numbers), always 2 decimals, no-break space before €.
// Display only — API JSON, stored data and machine-readable markup keep plain numbers.

export const NBSP = ' ';

export function formatNumberEl(value: number | string | null | undefined): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '';
  const neg = n < 0 && Math.abs(n) >= 0.005;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped},${dec}`;
}

export function formatPrice(value: number | string | null | undefined): string {
  const s = formatNumberEl(value);
  return s ? `${s}${NBSP}€` : '';
}

// formatUnitPrice(0.83, 'λίτρο') → "0,83 €/λίτρο"
export function formatUnitPrice(value: number | string | null | undefined, per: string): string {
  const s = formatPrice(value);
  return s ? `${s}/${per}` : '';
}
