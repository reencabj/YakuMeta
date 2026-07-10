import { cn } from "@/lib/utils";
import { DollarSign, Droplets, FlaskConical, Timer } from "lucide-react";
import { PanelCard, StatTile } from "@/components/shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LAVADO_ALMACENES } from "../lavadoConstants";
import { asPct, money, moneyCompact, num } from "../lavadoFormatters";
import type { LavadoMoneySummary } from "../lavadoService";

export function LavadoMoneyCounterPanel(props: {
  summary: LavadoMoneySummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  className?: string;
}) {
  const totals = props.summary?.totals;
  const byAlmacen = props.summary?.byAlmacen ?? [];

  const ingresado = num(totals?.ingresado_completado);
  const salida = num(totals?.salida_completado);
  const perdida = ingresado - salida;
  const perdidaPct = ingresado > 0 ? (perdida / ingresado) * 100 : 0;
  const ingresadoActivo = num(totals?.ingresado_activo);
  const salidaActivo = num(totals?.salida_activo);
  const imprimirCompletadas = num(totals?.tandas_imprimir_completadas);
  const secarCompletadas = num(totals?.tandas_secar_completadas);

  const rowsByAlmacen = LAVADO_ALMACENES.map((alm) => {
    const row = byAlmacen.find((r) => r.almacen === alm.id);
    const ing = num(row?.ingresado_completado);
    const out = num(row?.salida_completado);
    return {
      id: alm.id,
      label: alm.label,
      ingresado: ing,
      salida: out,
      perdida: ing - out,
      imprimirCompletadas: num(row?.tandas_imprimir_completadas),
      secarCompletadas: num(row?.tandas_secar_completadas),
      ingresadoActivo: num(row?.ingresado_activo),
      salidaActivo: num(row?.salida_activo),
    };
  });

  return (
    <PanelCard
      icon={DollarSign}
      title="Contador de dinero lavado"
      description="Entrada acumulada en imprimir · salida acumulada en secar (tandas completadas)."
      className={cn("min-h-0 flex-1", props.className)}
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {props.isError ? (
        <p className="text-sm text-red-400">No se pudieron cargar los totales. ¿Aplicaste la migración de vistas SQL?</p>
      ) : props.isLoading && !props.summary ? (
        <p className="text-sm text-muted-foreground">Cargando totales…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <section className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={DollarSign}
              label="Ingresado (imprimir)"
              value={`$${money(ingresado)}`}
              unit="USD"
              hint={`${imprimirCompletadas} tandas de impresión`}
              tone="amber"
              dense
            />
            <StatTile
              icon={FlaskConical}
              label="Sacado (secado)"
              value={`$${money(salida)}`}
              unit="USD"
              hint={`${secarCompletadas} tandas de secado`}
              tone="emerald"
              dense
            />
            <StatTile
              icon={Droplets}
              label="Pérdida acumulada"
              value={`$${money(perdida)}`}
              unit={ingresado > 0 ? `${asPct(perdidaPct / 100)}%` : ""}
              tone="rose"
              dense
            />
            <StatTile
              icon={Timer}
              label="En curso ahora"
              value={`$${money(ingresadoActivo)}`}
              unit={`→ ${moneyCompact(salidaActivo)}`}
              hint="Imprimir activo → secado activo (salida est.)"
              tone="slate"
              dense
            />
          </section>

          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Ingresado</TableHead>
                  <TableHead className="text-right">Sacado</TableHead>
                  <TableHead className="text-right">Pérdida</TableHead>
                  <TableHead className="text-right">Imp. / Sec.</TableHead>
                  <TableHead className="text-right">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsByAlmacen.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">${money(row.ingresado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${money(row.salida)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">${money(row.perdida)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {row.imprimirCompletadas} / {row.secarCompletadas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {row.ingresadoActivo > 0 || row.salidaActivo > 0
                        ? `${moneyCompact(row.ingresadoActivo)} → ${moneyCompact(row.salidaActivo)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </PanelCard>
  );
}
