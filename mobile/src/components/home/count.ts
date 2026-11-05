// «13.154» — dot thousands separator by hand; Intl el-GR coverage on
// Hermes/Android varies by device (same reason as lib/format.ts).
export const formatCount = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
