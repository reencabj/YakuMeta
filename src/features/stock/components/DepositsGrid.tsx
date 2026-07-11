import type { DepositRowModel } from "@/hooks/useDeposits";
import { depositFaltanteBolsas } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { depositTypeIcon } from "./deposit-type-icon";

type Props = {
  deposits: DepositRowModel[];
  onSelectDeposit: (d: DepositRowModel) => void;
  onExtractDeposit?: (d: DepositRowModel) => void;
  onQuickAdjust?: (d: DepositRowModel, deltaKg: number) => void;
  quickAdjustBusy?: boolean;
};

function fmtKg(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

function barTone(pct: number | null): "default" | "success" | "warning" | "danger" {
  if (pct === null || Number.isNaN(pct)) return "default";
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  if (pct >= 30) return "default";
  return "success";
}

export function DepositsGrid(props: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {props.deposits.map((d) => {
        const Icon = depositTypeIcon(d.tipo.slug);
        const pct = d.ocupacion_pct;
        const pctWidth = pct === null ? 0 : Math.min(100, Math.max(0, pct));
        const capMeta = Number(d.capacidad_meta_kilos);
        const espacioDisponibleMeta = Math.max(0, capMeta - Number(d.total_meta_kg));
        const bag = depositFaltanteBolsas(Number(d.capacidad_meta_kilos), d.total_meta_kg);
        const inactive = !d.is_active;
        const tooltip = [
          `Cap. meta ${fmtKg(Number(d.capacidad_meta_kilos))} kg`,
          `Guardado ${fmtKg(Number(d.capacidad_guardado_kg))} kg`,
          `Reservado ${fmtKg(d.reservado_meta_kg)} · Libre ${fmtKg(d.libre_meta_kg)}`,
          d.nearest_expiry ? `Venc. próx. ${d.nearest_expiry}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={d.id}
            title={tooltip}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface",
              inactive && "opacity-60"
            )}
          >
            <button
              type="button"
              disabled={inactive}
              onClick={() => props.onSelectDeposit(d)}
              className={cn(
                "flex flex-col gap-3 p-4 text-left transition-ui hover:bg-surface-elevated/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                inactive && "cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-subtle bg-background-secondary text-muted-foreground transition-ui group-hover:text-foreground">
                  <Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold leading-tight">{d.nombre}</h3>
                  <p className="truncate text-xs text-muted-foreground">{d.tipo.nombre}</p>
                </div>
              </div>

              <div className="space-y-1">
                <ProgressBar value={pctWidth} tone={barTone(pct)} />
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {pct === null ? "—" : `${pct.toFixed(0)} %`} ocupación
                </p>
              </div>

              <div className="space-y-1 border-t border-subtle pt-3">
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {fmtKg(d.total_meta_kg)} <span className="text-sm font-normal text-muted-foreground">kg</span>
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {bag.ocupadasBolsas} / {bag.capacidadBolsas} <span className="text-xs">bolsas</span>
                </p>
              </div>

              <div className="rounded-md bg-background-secondary px-2.5 py-2 text-xs leading-snug">
                {bag.faltanBolsas > 0 ? (
                  <>
                    <span className="font-medium text-foreground">Faltan {bag.faltanBolsas} bolsas</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="tabular-nums text-muted-foreground">
                      {bag.packs3Faltantes}p + {bag.individualesFaltantes}i
                    </span>
                  </>
                ) : (
                  <span className="text-success">Completo</span>
                )}
              </div>
            </button>

            {props.onExtractDeposit && d.is_active && props.onQuickAdjust ? (
              <div className="border-t border-subtle px-3 pb-3 pt-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {[-1, -0.5, 0.5, 1].map((delta) => {
                    const isNegative = delta < 0;
                    const canApply = isNegative
                      ? d.libre_meta_kg >= Math.abs(delta)
                      : espacioDisponibleMeta + 1e-9 >= delta;
                    const label = `${delta > 0 ? "+" : ""}${String(delta).replace(".", ",")} kg`;
                    return (
                      <Button
                        key={delta}
                        type="button"
                        size="sm"
                        variant={canApply ? "secondary" : "ghost"}
                        className="h-7 px-0 text-[10px]"
                        disabled={props.quickAdjustBusy || !canApply}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          props.onQuickAdjust?.(d, delta);
                        }}
                        title={isNegative ? "Quitar stock" : "Agregar stock"}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
