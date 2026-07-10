import { Clock3, Settings } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lavadoAlmacenLabel, PROCESS_META } from "../lavadoConstants";
import { money, num } from "../lavadoFormatters";
import type { LavadoConfigRow, LavadoTandaRow } from "../lavadoService";
import { LavadoCollapsiblePanel } from "./LavadoCollapsiblePanel";
import { LavadoConfigForm } from "./LavadoConfigForm";

export function LavadoHistoryPanel(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: LavadoTandaRow[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <LavadoCollapsiblePanel
      icon={Clock3}
      title="Historial"
      description="Últimas 50 tandas completadas o canceladas"
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      {props.isError ? (
        <p className="text-sm text-red-400">No se pudo cargar el historial.</p>
      ) : props.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>E</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.history.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(t.iniciado_at).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell>{lavadoAlmacenLabel(t.almacen)}</TableCell>
                  <TableCell>{PROCESS_META[t.proceso].label}</TableCell>
                  <TableCell>{t.estacion}</TableCell>
                  <TableCell className="tabular-nums">${money(num(t.monto_entrada))}</TableCell>
                  <TableCell className="tabular-nums">${money(num(t.monto_salida_esperado))}</TableCell>
                  <TableCell>{t.estado}</TableCell>
                </TableRow>
              ))}
              {props.history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    Sin tandas finalizadas todavía.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </LavadoCollapsiblePanel>
  );
}

export function LavadoConfigPanel(props: {
  config: LavadoConfigRow;
  saving: boolean;
  onSave: (form: LavadoConfigRow) => void;
}) {
  return (
    <LavadoCollapsiblePanel
      icon={Settings}
      title="Configuración"
      description="Reglas por proceso · duración al máximo de cada máquina"
      className="lg:col-span-2"
    >
      <LavadoConfigForm config={props.config} canEdit saving={props.saving} onSave={props.onSave} />
    </LavadoCollapsiblePanel>
  );
}
