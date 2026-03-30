import { describe, expect, it } from "vitest";
import { batchBagsFromMetadataOrKg, depositFaltanteBolsas, decomposeBolsasToPacks3AndIndividuales } from "./meta-bags";

describe("depositFaltanteBolsas", () => {
  it("1 kg cap y 0.8 kg ocupado → 10 bolsas faltantes → 3 packs + 1 individual", () => {
    const r = depositFaltanteBolsas(1, 0.8);
    expect(r.capacidadBolsas).toBe(50);
    expect(r.ocupadasBolsas).toBe(40);
    expect(r.faltanBolsas).toBe(10);
    expect(r.packs3Faltantes).toBe(3);
    expect(r.individualesFaltantes).toBe(1);
  });
});

describe("decomposeBolsasToPacks3AndIndividuales", () => {
  it("10 bolsas → 3 packs + 1", () => {
    expect(decomposeBolsasToPacks3AndIndividuales(10)).toEqual({ packsDe3: 3, bolsasIndividuales: 1 });
  });
});

describe("batchBagsFromMetadataOrKg", () => {
  it("usa metadata si existe", () => {
    const r = batchBagsFromMetadataOrKg(
      { packs_de_3: 13, bolsas_individuales: 1, total_bolsas: 40 },
      0.8
    );
    expect(r.fuente).toBe("metadata");
    if (r.fuente === "metadata") {
      expect(r.totalBolsas).toBe(40);
      expect(r.packsDe3).toBe(13);
    }
  });

  it("sin metadata estima desde kg", () => {
    const r = batchBagsFromMetadataOrKg(null, 0.8);
    expect(r.fuente).toBe("estimado");
    if (r.fuente === "estimado") expect(r.totalBolsas).toBe(40);
  });
});
