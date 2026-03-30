/** Formato legible para kg en UI (dashboard, KPIs). */
export function fmtKgDisplay(n: number | null | undefined, loading: boolean): string {
  if (loading) return "…";
  if (n === undefined || n === null) return "—";
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
