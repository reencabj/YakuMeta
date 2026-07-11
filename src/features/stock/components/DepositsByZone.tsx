import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Building2, Factory, Home, Landmark, MapPin, Trees } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DepositRowModel } from "@/hooks/useDeposits";
import { type DepositSortMode, groupDepositsByZona } from "@/lib/deposit-zona";
import { cn } from "@/lib/utils";
import { DepositsGrid } from "./DepositsGrid";

type Props = {
  deposits: DepositRowModel[];
  depositSort: DepositSortMode;
  onSelectDeposit: (d: DepositRowModel) => void;
  onExtractDeposit?: (d: DepositRowModel) => void;
  onQuickAdjust?: (d: DepositRowModel, deltaKg: number) => void;
  quickAdjustBusy?: boolean;
};

const ZONE_ICONS: LucideIcon[] = [MapPin, Building2, Landmark, Home, Factory, Trees];

function zonaIcon(key: string): LucideIcon {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ZONE_ICONS[h % ZONE_ICONS.length];
}

function fmtKg(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

/** Stock/capacidad en tarjetas de zona: «2 kg», «1,5 kg» (sin «meta»). */
function fmtKgShort(n: number) {
  return `${fmtKg(n)} kg`;
}

/** Ancho 0–100 % para la capa de ocupación de la tarjeta (suma stock / suma capacidad). */
function zonaOcupacionWidthPct(totalKg: number, totalCapMeta: number): number {
  if (totalCapMeta > 0) return Math.min(100, Math.max(0, (totalKg / totalCapMeta) * 100));
  if (totalKg > 0) return 100;
  return 0;
}

/** Etiqueta de % ocupación de zona (misma lógica que por depósito cuando no hay cap). */
function zonaOcupacionLabel(totalKg: number, totalCapMeta: number): string | null {
  if (totalCapMeta > 0) return `${zonaOcupacionWidthPct(totalKg, totalCapMeta).toFixed(0)} %`;
  if (totalKg > 0) return "100 %";
  return null;
}

export function DepositsByZone(props: Props) {
  const groups = useMemo(
    () => groupDepositsByZona(props.deposits, props.depositSort),
    [props.deposits, props.depositSort]
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedKey !== null && !groups.some((g) => g.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [groups, selectedKey]);

  const singleZone = groups.length === 1 ? groups[0] : null;
  const activeGroup = singleZone ?? groups.find((g) => g.key === selectedKey) ?? null;

  if (props.deposits.length === 0) {
    return null;
  }

  if (singleZone) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Zona: <span className="font-medium text-foreground">{singleZone.label}</span> · {singleZone.count}{" "}
          depósito{singleZone.count === 1 ? "" : "s"}
        </p>
        <DepositsGrid
          deposits={singleZone.deposits}
          onSelectDeposit={props.onSelectDeposit}
          onExtractDeposit={props.onExtractDeposit}
          onQuickAdjust={props.onQuickAdjust}
          quickAdjustBusy={props.quickAdjustBusy}
        />
      </div>
    );
  }

  if (activeGroup && selectedKey !== null) {
    const Icon = zonaIcon(activeGroup.key);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedKey(null)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-2 text-sm",
            "text-muted-foreground transition-ui hover:bg-surface-elevated hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Todas las zonas
        </button>
        <div className="flex items-center gap-3 border-b border-subtle pb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-subtle bg-background-secondary">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{activeGroup.label}</h2>
            <p className="text-sm tabular-nums text-muted-foreground">
              {activeGroup.count} depósito{activeGroup.count === 1 ? "" : "s"} · {fmtKgShort(activeGroup.totalKg)}
              {activeGroup.totalCapMetaKg > 0 ? <> / {fmtKgShort(activeGroup.totalCapMetaKg)}</> : null}
            </p>
          </div>
        </div>
        <DepositsGrid
          deposits={activeGroup.deposits}
          onSelectDeposit={props.onSelectDeposit}
          onExtractDeposit={props.onExtractDeposit}
          onQuickAdjust={props.onQuickAdjust}
          quickAdjustBusy={props.quickAdjustBusy}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      )}
    >
      {groups.map((g) => {
        const Icon = zonaIcon(g.key);
        const fillPct = zonaOcupacionWidthPct(g.totalKg, g.totalCapMetaKg);
        const pctLabel = zonaOcupacionLabel(g.totalKg, g.totalCapMetaKg);
        const libreKg = Math.max(0, g.totalCapMetaKg - g.totalKg);
        const title = [
          pctLabel ? `${pctLabel} ocupación` : null,
          g.totalCapMetaKg > 0 ? `${fmtKgShort(libreKg)} libres` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={g.key}
            type="button"
            title={title || undefined}
            onClick={() => setSelectedKey(g.key)}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface px-3 py-2 text-left",
              "transition-ui hover:border-strong hover:bg-surface-elevated",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-300 ease-out"
              style={{ width: `${fillPct}%` }}
              aria-hidden
            />
            <div className="relative z-10 flex flex-col gap-1">
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-md border border-subtle bg-background-secondary",
                    "text-muted-foreground transition-ui group-hover:text-foreground"
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight tracking-tight">{g.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {g.count} depósito{g.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p
                    className="shrink-0 text-right text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground"
                    aria-label={`Stock ${fmtKgShort(g.totalKg)}`}
                  >
                    {fmtKgShort(g.totalKg)}
                  </p>
                </div>
              </div>
              <div className="border-t border-subtle pt-1 text-center">
                <p className="text-[11px] leading-tight tabular-nums text-muted-foreground">
                  {pctLabel ? (
                    <>
                      <span className="text-foreground">{pctLabel}</span> ocupación
                      {g.totalCapMetaKg > 0 ? (
                        <>
                          {" "}
                          · {fmtKgShort(libreKg)} libre
                        </>
                      ) : null}
                    </>
                  ) : g.totalCapMetaKg <= 0 ? (
                    "Sin capacidad"
                  ) : null}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
