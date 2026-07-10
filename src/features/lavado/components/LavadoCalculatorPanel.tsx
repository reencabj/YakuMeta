import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";
import { money } from "../lavadoFormatters";
import { estimatePipeline, formatDuration, type LavadoConfigSnapshot } from "../lavadoMath";
import { LavadoCollapsiblePanel } from "./LavadoCollapsiblePanel";

export function LavadoCalculatorPanel(props: {
  snapshot: LavadoConfigSnapshot | null;
  calcAmount: string;
  onCalcAmountChange: (v: string) => void;
  calcMode: "pipeline" | "sequential";
  onCalcModeChange: (mode: "pipeline" | "sequential") => void;
}) {
  const calc = props.snapshot
    ? estimatePipeline(props.snapshot, Math.max(0, Number(props.calcAmount) || 0))
    : null;

  return (
    <LavadoCollapsiblePanel
      icon={FlaskConical}
      title="Calculadora"
      description="Pipeline · pérdidas y tiempos estimados"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs space-y-1">
          <Label className="text-xs">Monto inicial</Label>
          <Input className="h-9" value={props.calcAmount} onChange={(e) => props.onCalcAmountChange(e.target.value)} />
        </div>
        <div className="inline-flex rounded-md border border-border/60 bg-muted/20 p-1 text-xs">
          <button
            type="button"
            onClick={() => props.onCalcModeChange("pipeline")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              props.calcMode === "pipeline" ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => props.onCalcModeChange("sequential")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              props.calcMode === "sequential" ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Secuencial
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm leading-relaxed">
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Final limpio</span>
            <span className="whitespace-nowrap">${money(calc?.finalAmount ?? 0)}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Pérdida total</span>
            <span className="whitespace-nowrap">${money(calc?.totalLoss ?? 0)}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Pérdida %</span>
            <span className="whitespace-nowrap">{((calc?.totalLossPct ?? 0) || 0).toFixed(2)}%</span>
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm leading-relaxed">
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Rendimiento final</span>
            <span className="whitespace-nowrap">{(calc?.finalPct ?? 0).toFixed(2)}%</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Tiempo total ({props.calcMode === "pipeline" ? "pipeline" : "secuencial"})</span>
            <span className="whitespace-nowrap">
              {formatDuration(props.calcMode === "pipeline" ? calc?.totalSeconds ?? 0 : calc?.sequentialTotalSeconds ?? 0)}
            </span>
          </p>
          {props.calcMode === "pipeline" ? (
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Primera salida</span>
              <span className="whitespace-nowrap">{formatDuration(calc?.firstOutputSeconds ?? 0)}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proceso</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead>Pérdida</TableHead>
              <TableHead>Tandas</TableHead>
              <TableHead>Tiempo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(calc?.steps ?? []).map((s) => (
              <TableRow key={s.proceso}>
                <TableCell>{s.nombre}</TableCell>
                <TableCell>${money(s.entrada)}</TableCell>
                <TableCell>${money(s.salida)}</TableCell>
                <TableCell>{s.perdidaPct.toFixed(2)}%</TableCell>
                <TableCell>{s.tandas}</TableCell>
                <TableCell>{formatDuration(s.segundosAjustadoEstaciones)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </LavadoCollapsiblePanel>
  );
}
