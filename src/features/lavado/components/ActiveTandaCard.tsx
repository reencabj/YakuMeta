import { memo, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lavadoAlmacenLabel, PROCESS_META } from "../lavadoConstants";
import { moneyCompact, num, tandaRemainingSeconds } from "../lavadoFormatters";
import { formatDuration } from "../lavadoMath";
import type { LavadoTandaRow } from "../lavadoService";

function playTandaFinishedBeep() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = [880, 988, 1174, 1318];
    const toneDuration = 0.12;
    const gap = 0.06;
    const startAt = ctx.currentTime + 0.01;

    tones.forEach((freq, index) => {
      const t0 = startAt + index * (toneDuration + gap);
      const t1 = t0 + toneDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    });

    const total = tones.length * (toneDuration + gap) + 0.12;
    window.setTimeout(() => void ctx.close(), Math.ceil(total * 1000));
  } catch {
    // Si el navegador bloquea audio sin interacción previa, ignoramos silenciosamente.
  }
}

export const ActiveTandaCard = memo(function ActiveTandaCard(props: {
  tanda: LavadoTandaRow;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const t = props.tanda;
  const beepedRef = useRef(false);
  const [remaining, setRemaining] = useState(() => tandaRemainingSeconds(t.finaliza_estimado_at));

  useEffect(() => {
    beepedRef.current = false;
    setRemaining(tandaRemainingSeconds(t.finaliza_estimado_at));
  }, [t.id, t.finaliza_estimado_at]);

  useEffect(() => {
    const tick = () => {
      const next = tandaRemainingSeconds(t.finaliza_estimado_at);
      setRemaining(next);
      if (next === 0 && !beepedRef.current) {
        beepedRef.current = true;
        playTandaFinishedBeep();
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [t.finaliza_estimado_at]);

  const done = remaining === 0;

  return (
    <div
      className={cn(
        "flex h-full min-h-[9rem] w-full min-w-0 flex-col overflow-hidden rounded-md border border-subtle bg-surface p-2.5",
        done && "border-success/40 bg-success/5"
      )}
    >
      <div className="shrink-0 space-y-1">
        <p className="truncate text-xs font-semibold leading-none">{lavadoAlmacenLabel(t.almacen)}</p>
        <p className="truncate text-[11px] leading-none text-muted-foreground">
          {PROCESS_META[t.proceso].label} · E{t.estacion}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-1">
        <p
          className={cn(
            "max-w-full truncate text-center font-mono text-base font-semibold tabular-nums leading-none",
            done ? "text-success" : "text-foreground"
          )}
        >
          {formatDuration(remaining)}
        </p>
      </div>

      <p className="shrink-0 truncate text-center text-[11px] leading-none tabular-nums text-muted-foreground">
        {moneyCompact(num(t.monto_entrada))} → {moneyCompact(num(t.monto_salida_esperado))}
      </p>

      <div className="mt-1.5 grid shrink-0 grid-cols-2 gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 min-w-0 gap-1 px-1.5 text-[11px] leading-none"
          onClick={() => props.onComplete(t.id)}
          title="Completar"
        >
          <Check className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Listo</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 min-w-0 gap-1 px-1.5 text-[11px] leading-none text-red-400 hover:text-red-300"
          onClick={() => props.onCancel(t.id)}
          title="Cancelar"
        >
          <X className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Cancelar</span>
        </Button>
      </div>
    </div>
  );
});
