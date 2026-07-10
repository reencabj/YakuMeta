import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asPct, num } from "../lavadoFormatters";
import type { LavadoConfigRow } from "../lavadoService";

export function LavadoConfigForm(props: {
  config: LavadoConfigRow;
  canEdit: boolean;
  saving: boolean;
  onSave: (form: LavadoConfigRow) => void;
}) {
  const [form, setForm] = useState(props.config);

  useEffect(() => setForm(props.config), [props.config]);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <ProcessConfigCard title="Imprimir">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_1)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_1: Number(v) / 100 }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_1)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_1: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput label="Máximo" value={String(form.max_proceso_1)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_1: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput
            label="Duración al máximo (min)"
            value={String(form.duracion_base_p1_minutos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_base_p1_minutos: Number(v) }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p1)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p1: Number(v) }))} disabled={!props.canEdit} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Cortar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_2)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_2: Number(v) / 100 }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_2)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_2: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput label="Máximo" value={String(form.max_proceso_2)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_2: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput
            label="Duración manual (seg)"
            value={String(form.duracion_manual_p2_segundos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_manual_p2_segundos: Number(v) }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p2)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p2: Number(v) }))} disabled={!props.canEdit} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Secar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_3)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_3: Number(v) / 100 }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_3)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_3: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput label="Máximo" value={String(form.max_proceso_3)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_3: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput
            label="Duración al máximo (min)"
            value={String(form.duracion_base_p3_minutos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_base_p3_minutos: Number(v) }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p3)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p3: Number(v) }))} disabled={!props.canEdit} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Contar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_4)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_4: Number(v) / 100 }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_4)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_4: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput label="Máximo" value={String(form.max_proceso_4)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_4: Number(v) }))} disabled={!props.canEdit} />
          <FieldInput
            label="Duración manual (seg)"
            value={String(form.duracion_manual_p4_segundos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_manual_p4_segundos: Number(v) }))}
            disabled={!props.canEdit}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p4)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p4: Number(v) }))} disabled={!props.canEdit} />
        </ProcessConfigCard>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" disabled={!props.canEdit || props.saving} onClick={() => props.onSave(form)}>
          {props.saving ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </>
  );
}

function ProcessConfigCard(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{props.children}</div>
    </div>
  );
}

function FieldInput(props: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Input className="h-9" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
