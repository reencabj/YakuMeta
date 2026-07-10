export function asPct(n: number) {
  return Math.round(n * 10000) / 100;
}

export function num(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function moneyCompact(n: number) {
  const v = num(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${money(v)}`;
}

export function tandaRemainingSeconds(finishAt: string, nowMs = Date.now()) {
  return Math.max(0, Math.round((new Date(finishAt).getTime() - nowMs) / 1000));
}
