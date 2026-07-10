import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PROCESS_META, type LavadoAlmacenId } from "../lavadoConstants";
import { money } from "../lavadoFormatters";
import { formatDuration, processDurationSeconds, type LavadoProcesoConfig, type LavadoProcesoId } from "../lavadoMath";
import type { LavadoTandaRow } from "../lavadoService";

function defaultProcessAmount(cfg: LavadoProcesoConfig | null): string {
  if (!cfg || cfg.maximo <= 0) return "";
  return String(cfg.maximo);
}

function tandaDurationLabel(cfg: LavadoProcesoConfig | null, amountRaw: string): string | null {
  if (!cfg) return null;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < cfg.minimo || amount > cfg.maximo) return null;
  return formatDuration(processDurationSeconds(cfg, amount));
}

function firstFreeStation(totalStations: number, occupied: Set<string>) {
  for (let i = 1; i <= Math.max(1, totalStations); i += 1) {
    const s = String(i);
    if (!occupied.has(s)) return s;
  }
  return "1";
}

export function WarehouseTandaPanel(props: {
  almacen: LavadoAlmacenId;
  label: string;
  printCfg: LavadoProcesoConfig | null;
  dryCfg: LavadoProcesoConfig | null;
  active: LavadoTandaRow[];
  isPending: boolean;
  onStart: (input: { process: LavadoProcesoId; amount: number; station: number }) => void;
}) {
  const printEditedRef = useRef(false);
  const dryEditedRef = useRef(false);
  const [printAmount, setPrintAmount] = useState(() => defaultProcessAmount(props.printCfg));
  const [printStation, setPrintStation] = useState("1");
  const [dryAmount, setDryAmount] = useState(() => defaultProcessAmount(props.dryCfg));
  const [dryStation, setDryStation] = useState("1");

  useEffect(() => {
    if (props.printCfg && !printEditedRef.current) setPrintAmount(defaultProcessAmount(props.printCfg));
  }, [props.printCfg?.maximo]);

  useEffect(() => {
    if (props.dryCfg && !dryEditedRef.current) setDryAmount(defaultProcessAmount(props.dryCfg));
  }, [props.dryCfg?.maximo]);

  const warehouseActive = useMemo(
    () => props.active.filter((t) => t.almacen === props.almacen),
    [props.active, props.almacen]
  );
  const occupiedPrintStations = useMemo(
    () => new Set(warehouseActive.filter((t) => t.proceso === "imprimir").map((t) => String(t.estacion))),
    [warehouseActive]
  );
  const occupiedDryStations = useMemo(
    () => new Set(warehouseActive.filter((t) => t.proceso === "secar").map((t) => String(t.estacion))),
    [warehouseActive]
  );

  useEffect(() => {
    const total = props.printCfg?.estaciones ?? 1;
    const currentBusy = occupiedPrintStations.has(printStation);
    const currentOutOfRange = Number(printStation) < 1 || Number(printStation) > total;
    if (currentBusy || currentOutOfRange) {
      setPrintStation(firstFreeStation(total, occupiedPrintStations));
    }
  }, [occupiedPrintStations, props.printCfg?.estaciones, printStation]);

  useEffect(() => {
    const total = props.dryCfg?.estaciones ?? 1;
    const currentBusy = occupiedDryStations.has(dryStation);
    const currentOutOfRange = Number(dryStation) < 1 || Number(dryStation) > total;
    if (currentBusy || currentOutOfRange) {
      setDryStation(firstFreeStation(total, occupiedDryStations));
    }
  }, [props.dryCfg?.estaciones, dryStation, occupiedDryStations]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border p-2.5",
        props.almacen === "liquid"
          ? "border-primary/35 bg-primary/[0.06]"
          : "border-emerald-500/30 bg-emerald-500/[0.06]"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold leading-none">{props.label}</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {warehouseActive.length} activa{warehouseActive.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-2">
        <CompactProcessBlock
          title="Imprimir · E1"
          hint={`${PROCESS_META.imprimir.in} → ${PROCESS_META.imprimir.out}`}
          amount={printAmount}
          onAmountChange={(v) => {
            printEditedRef.current = true;
            setPrintAmount(v);
          }}
          station={printStation}
          onStationSelect={setPrintStation}
          totalStations={props.printCfg?.estaciones ?? 1}
          occupied={occupiedPrintStations}
          expectedOutput={props.printCfg ? (Number(printAmount) || 0) * (1 - props.printCfg.perdida) : 0}
          estimatedDuration={tandaDurationLabel(props.printCfg, printAmount)}
          minAmount={props.printCfg?.minimo}
          maxAmount={props.printCfg?.maximo}
          buttonLabel="Imprimir"
          isPending={props.isPending}
          onStart={() =>
            props.onStart({ process: "imprimir", amount: Number(printAmount), station: Number(printStation) })
          }
        />
        <CompactProcessBlock
          title="Secar · E1, E2"
          hint={`${PROCESS_META.secar.in} → ${PROCESS_META.secar.out}`}
          amount={dryAmount}
          onAmountChange={(v) => {
            dryEditedRef.current = true;
            setDryAmount(v);
          }}
          station={dryStation}
          onStationSelect={setDryStation}
          totalStations={props.dryCfg?.estaciones ?? 1}
          occupied={occupiedDryStations}
          expectedOutput={props.dryCfg ? (Number(dryAmount) || 0) * (1 - props.dryCfg.perdida) : 0}
          estimatedDuration={tandaDurationLabel(props.dryCfg, dryAmount)}
          minAmount={props.dryCfg?.minimo}
          maxAmount={props.dryCfg?.maximo}
          buttonLabel="Secar"
          isPending={props.isPending}
          onStart={() =>
            props.onStart({ process: "secar", amount: Number(dryAmount), station: Number(dryStation) })
          }
        />
      </div>
    </div>
  );
}

function CompactProcessBlock(props: {
  title: string;
  hint: string;
  amount: string;
  onAmountChange: (v: string) => void;
  station: string;
  onStationSelect: (v: string) => void;
  totalStations: number;
  occupied: Set<string>;
  expectedOutput: number;
  estimatedDuration: string | null;
  minAmount?: number;
  maxAmount?: number;
  buttonLabel: string;
  isPending: boolean;
  onStart: () => void;
}) {
  const amountNum = Number(props.amount);
  const hasAmount = props.amount.trim() !== "" && Number.isFinite(amountNum);
  const outOfRange =
    hasAmount &&
    props.minAmount != null &&
    props.maxAmount != null &&
    (amountNum < props.minAmount || amountNum > props.maxAmount);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/50 bg-muted/15 p-2" title={props.hint}>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">${money(props.expectedOutput)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="min-w-[72px] flex-1">
          <FieldInput compact label="Entrada" value={props.amount} onChange={props.onAmountChange} />
        </div>
        <div className={cn("shrink-0", props.totalStations > 1 ? "min-w-[5.5rem]" : "min-w-[2.75rem]")}>
          <StationButtons
            compact
            label="Est."
            selected={props.station}
            onSelect={props.onStationSelect}
            totalStations={props.totalStations}
            occupied={props.occupied}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs"
          disabled={props.isPending || !props.estimatedDuration}
          onClick={props.onStart}
        >
          {props.buttonLabel}
        </Button>
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {props.estimatedDuration ? (
          <>Tiempo estimado: {props.estimatedDuration}</>
        ) : outOfRange && props.minAmount != null && props.maxAmount != null ? (
          <>Rango: ${money(props.minAmount)} – ${money(props.maxAmount)}</>
        ) : (
          <>Tiempo proporcional al máximo de la máquina</>
        )}
      </p>
    </div>
  );
}

function FieldInput(props: { label: string; value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={cn("space-y-1", props.compact && "space-y-0.5")}>
      <Label className={cn("text-xs", props.compact && "text-[10px]")}>{props.label}</Label>
      <Input
        className={cn("h-9", props.compact && "h-8 px-2 text-sm")}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function StationButtons(props: {
  label: string;
  selected: string;
  onSelect: (v: string) => void;
  totalStations: number;
  occupied: Set<string>;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-1", props.compact && "space-y-0.5")}>
      <Label className={cn("text-xs", props.compact && "text-[10px]")}>{props.label}</Label>
      <div className={cn("flex gap-1", props.compact ? "h-8" : "h-9 gap-2")}>
        {Array.from({ length: Math.max(1, props.totalStations) }, (_, i) => {
          const station = String(i + 1);
          const busy = props.occupied.has(station);
          const selected = props.selected === station;
          return (
            <button
              key={station}
              type="button"
              disabled={busy}
              onClick={() => props.onSelect(station)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center rounded-md border transition-colors",
                props.compact ? "px-1 text-xs" : "px-2 text-sm",
                selected
                  ? "border-primary/45 bg-primary/20 text-foreground"
                  : "border-input bg-background text-foreground hover:bg-muted/60",
                busy && "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground opacity-70"
              )}
              title={busy ? `Estación ${station} ocupada` : `Estación ${station}`}
            >
              E{station}
            </button>
          );
        })}
      </div>
    </div>
  );
}
