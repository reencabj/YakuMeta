import type { DepositRowModel } from "@/hooks/useDeposits";
import { depositFaltanteBolsas } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { depositTypeIcon } from "./deposit-type-icon";

type Props = {
  deposits: DepositRowModel[];
  onSelectDeposit: (d: DepositRowModel) => void;
  /** Extracción FIFO parcial sin abrir el detalle (Stock). */
  onExtractDeposit?: (d: DepositRowModel) => void;
};

function fmtKg(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

function barTone(pct: number | null): { bar: string; track: string } {
  if (pct === null || Number.isNaN(pct)) return { bar: "bg-muted-foreground/30", track: "bg-muted/80" };
  if (pct >= 70) return { bar: "bg-primary/80", track: "bg-muted/80" };
  if (pct >= 30) return { bar: "bg-foreground/45", track: "bg-muted/80" };
  return { bar: "bg-destructive/70", track: "bg-muted/80" };
}

export function DepositsGrid(props: Props) {
  return (
    <div
      className={cn(
        "grid gap-4",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      )}
    >
      {props.deposits.map((d) => {
        const Icon = depositTypeIcon(d.tipo.slug);
        const pct = d.ocupacion_pct;
        const tones = barTone(pct);
        const pctWidth = pct === null ? 0 : Math.min(100, Math.max(0, pct));
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
              "group relative flex flex-col gap-0 rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden",
              inactive && "opacity-60"
            )}
          >
            <button
              type="button"
              disabled={inactive}
              onClick={() => props.onSelectDeposit(d)}
              className={cn(
                "flex flex-col gap-3 p-4 text-left",
                "transition-all duration-200 hover:bg-muted/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                inactive && "cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40",
                    "text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary"
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold leading-tight tracking-tight">{d.nombre}</h3>
                  <p className="truncate text-xs text-muted-foreground">{d.tipo.nombre}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className={cn("h-2 w-full overflow-hidden rounded-full", tones.track)}>
                  <div
                    className={cn("h-full rounded-full transition-all duration-300", tones.bar)}
                    style={{ width: `${pctWidth}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {pct === null ? "—" : `${pct.toFixed(0)} %`} ocupación
                </p>
              </div>

              <div className="space-y-1 border-t border-border/50 pt-3">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {fmtKg(d.total_meta_kg)} <span className="text-lg font-normal text-muted-foreground">kg</span>
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {bag.ocupadasBolsas} / {bag.capacidadBolsas}{" "}
                  <span className="text-xs">bolsas</span>
                </p>
              </div>

              <div className="rounded-lg bg-muted/35 px-2.5 py-2 text-xs leading-snug">
                {bag.faltanBolsas > 0 ? (
                  <>
                    <span className="font-medium text-foreground">Faltan {bag.faltanBolsas} bolsas</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="tabular-nums text-muted-foreground">
                      {bag.packs3Faltantes}p + {bag.individualesFaltantes}i
                    </span>
                  </>
                ) : (
                  <span className="text-primary">Completo</span>
                )}
              </div>
            </button>

            {props.onExtractDeposit && d.is_active && d.libre_meta_kg > 0 ? (
              <div className="border-t border-border/60 bg-card/80 px-3 pb-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onExtractDeposit?.(d);
                  }}
                >
                  Extraer stock
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
