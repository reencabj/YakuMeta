import { useEffect, useState } from "react";
import { Clock3, Droplets, FlaskConical, Timer } from "lucide-react";
import { StatGrid, StatTile } from "@/components/shell";
import { money, num, tandaRemainingSeconds } from "../lavadoFormatters";
import { formatDuration } from "../lavadoMath";
import type { LavadoTandaRow } from "../lavadoService";

export function LavadoStatsSection(props: {
  active: LavadoTandaRow[];
  totalInProcess: number;
  totalOutEstimated: number;
}) {
  const nextToFinish = props.active[0] ?? null;
  const [nextRemaining, setNextRemaining] = useState(() =>
    nextToFinish ? tandaRemainingSeconds(nextToFinish.finaliza_estimado_at) : 0
  );

  useEffect(() => {
    if (!nextToFinish) {
      setNextRemaining(0);
      return;
    }
    const tick = () => setNextRemaining(tandaRemainingSeconds(nextToFinish.finaliza_estimado_at));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [nextToFinish?.id, nextToFinish?.finaliza_estimado_at]);

  return (
    <StatGrid columns={4}>
      <StatTile icon={Timer} label="Tandas activas" value={String(props.active.length)} unit="tandas" tone="slate" dense />
      <StatTile icon={Droplets} label="En impresión" value={money(props.totalInProcess)} unit="USD" tone="amber" dense />
      <StatTile icon={FlaskConical} label="En secado (est.)" value={money(props.totalOutEstimated)} unit="USD" tone="emerald" dense />
      <StatTile
        icon={Clock3}
        label="Próxima finalización"
        value={nextToFinish ? formatDuration(nextRemaining) : "—"}
        unit=""
        tone="rose"
        dense
      />
    </StatGrid>
  );
}

export function lavadoActiveMetrics(active: LavadoTandaRow[]) {
  const sorted = [...active].sort(
    (a, b) => new Date(a.finaliza_estimado_at).getTime() - new Date(b.finaliza_estimado_at).getTime()
  );
  const totalInProcess = sorted
    .filter((t) => t.proceso === "imprimir")
    .reduce((acc, t) => acc + num(t.monto_entrada), 0);
  const totalOutEstimated = sorted
    .filter((t) => t.proceso === "secar")
    .reduce((acc, t) => acc + num(t.monto_salida_esperado), 0);
  return { sorted, totalInProcess, totalOutEstimated };
}
