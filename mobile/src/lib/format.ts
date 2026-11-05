// Price wording, one place. Greek convention: decimal comma, euro sign after a
// space, dot as thousands separator («1.234,50 €»). The website still prints
// «0.83€»; DESIGN.md decided the app follows the chains' own style.

// Grouped by hand: Intl el-GR coverage on Hermes/Android varies by device, and
// Intl drops the separator for 4-digit numbers.
function num(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '−' : ''}${grouped},${dec}`;
}

/** formatPrice(1.5) -> "1,50 €" */
export const formatPrice = (n: number) => `${num(n)} €`;

/** The API's `unit` field: formatUnitPrice({ value: 0.83, per: 'λίτρο' }) -> "0,83 €/λίτρο" */
export const formatUnitPrice = (u: { value: number; per: string }) => `${formatPrice(u.value)}/${u.per}`;
