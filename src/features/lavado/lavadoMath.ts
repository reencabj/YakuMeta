export type LavadoProcesoId = "imprimir" | "cortar" | "secar" | "contar";

export type LavadoProcesoConfig = {
  id: LavadoProcesoId;
  nombre: string;
  perdida: number;
  minimo: number;
  maximo: number;
  estaciones: number;
  automatico: boolean;
  baseMinutos?: number;
  manualSegundos?: number;
};

export type LavadoConfigSnapshot = {
  procesos: LavadoProcesoConfig[];
};

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function processOutput(inputAmount: number, loss: number) {
  return roundMoney(inputAmount * (1 - loss));
}

export function processDurationSeconds(
  process: Pick<LavadoProcesoConfig, "automatico" | "baseMinutos" | "manualSegundos" | "maximo">,
  amount: number
) {
  if (process.automatico) {
    const maximo = process.maximo > 0 ? process.maximo : 1;
    const baseMinutos = process.baseMinutos ?? 116;
    return Math.max(1, Math.round((amount / maximo) * baseMinutos * 60));
  }
  return Math.max(1, Math.round(process.manualSegundos ?? 30));
}

export function batchesNeeded(totalAmount: number, maxByBatch: number) {
  if (maxByBatch <= 0) return 0;
  return Math.max(1, Math.ceil(totalAmount / maxByBatch));
}

export function estimatePipeline(config: LavadoConfigSnapshot, initialAmount: number) {
  let inAmount = initialAmount;
  const steps = config.procesos.map((p) => {
    const outAmount = processOutput(inAmount, p.perdida);
    const tandas = batchesNeeded(inAmount, p.maximo);
    const amountPerBatch = tandas > 0 ? inAmount / tandas : inAmount;
    const secondsPerBatch = processDurationSeconds(p, amountPerBatch);
    const secondsTotal = tandas * secondsPerBatch;
    const secondsStationAdjusted = secondsTotal / Math.max(1, p.estaciones);
    const step = {
      proceso: p.id,
      nombre: p.nombre,
      entrada: roundMoney(inAmount),
      salida: outAmount,
      perdidaMonto: roundMoney(inAmount - outAmount),
      perdidaPct: p.perdida * 100,
      tandas,
      segundosPorTanda: secondsPerBatch,
      segundosTotales: Math.round(secondsTotal),
      segundosAjustadoEstaciones: Math.round(secondsStationAdjusted),
    };
    inAmount = outAmount;
    return step;
  });

  const finalAmount = steps.at(-1)?.salida ?? initialAmount;
  const totalLoss = roundMoney(initialAmount - finalAmount);
  const totalLossPct = initialAmount > 0 ? (totalLoss / initialAmount) * 100 : 0;
  const finalPct = 100 - totalLossPct;
  const bottleneck =
    steps.length > 0
      ? [...steps].sort((a, b) => b.segundosAjustadoEstaciones - a.segundosAjustadoEstaciones)[0]
      : null;
  const printStep = steps.find((s) => s.proceso === "imprimir") ?? null;
  const dryStep = steps.find((s) => s.proceso === "secar") ?? null;
  const hasPipeline = Boolean(printStep && dryStep);

  const printCycleSeconds =
    printStep && printStep.tandas > 0 ? printStep.segundosAjustadoEstaciones / printStep.tandas : 0;
  const dryCycleSeconds = dryStep && dryStep.tandas > 0 ? dryStep.segundosAjustadoEstaciones / dryStep.tandas : 0;
  const cycleSeconds = hasPipeline ? Math.max(printCycleSeconds, dryCycleSeconds) : 0;
  const batchCount = hasPipeline ? Math.max(printStep?.tandas ?? 0, dryStep?.tandas ?? 0) : 0;
  const firstOutputSeconds = hasPipeline ? printCycleSeconds + dryCycleSeconds : 0;

  // Pipeline 2 etapas: primer lote tarda imprimir+secar; luego sale 1 lote por ciclo.
  const sequentialTotalSeconds = steps.reduce((acc, s) => acc + s.segundosAjustadoEstaciones, 0);
  const totalSeconds = hasPipeline
    ? Math.round(firstOutputSeconds + Math.max(0, batchCount - 1) * cycleSeconds)
    : sequentialTotalSeconds;

  const pipelineBottleneck =
    hasPipeline && printStep && dryStep ? (printCycleSeconds >= dryCycleSeconds ? printStep : dryStep) : null;

  return {
    steps,
    finalAmount: roundMoney(finalAmount),
    totalLoss,
    totalLossPct,
    finalPct,
    bottleneck,
    totalSeconds,
    sequentialTotalSeconds,
    cycleSeconds: Math.round(cycleSeconds),
    firstOutputSeconds: Math.round(firstOutputSeconds),
    pipelineBottleneck,
  };
}

export function formatDuration(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
