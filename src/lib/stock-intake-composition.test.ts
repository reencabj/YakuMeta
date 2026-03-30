import { describe, expect, it } from "vitest";
import { BOLSAS_PER_KG_META, metaKilosFromBagComposition, normalizeIntCount } from "./stock-intake-composition";

describe("normalizeIntCount", () => {
  it("trata vacíos como 0", () => {
    expect(normalizeIntCount("")).toBe(0);
    expect(normalizeIntCount(undefined)).toBe(0);
    expect(normalizeIntCount(null)).toBe(0);
  });

  it("parsea strings numéricos", () => {
    expect(normalizeIntCount("16")).toBe(16);
    expect(normalizeIntCount("  2  ")).toBe(2);
  });

  it("trunca y no admite negativos", () => {
    expect(normalizeIntCount(16.9)).toBe(16);
    expect(normalizeIntCount(-3)).toBe(0);
  });
});

describe("metaKilosFromBagComposition", () => {
  it("16 packs de 3 + 2 individuales = 50 bolsas = 1 kg (strings no concatenan)", () => {
    const r = metaKilosFromBagComposition("16", "2");
    expect(r.packsDe3).toBe(16);
    expect(r.bolsasIndividuales).toBe(2);
    expect(r.totalBolsas).toBe(50);
    expect(r.cantidadMetaKilos).toBe(1);
  });

  it("usa BOLSAS_PER_KG_META por defecto", () => {
    const r = metaKilosFromBagComposition(4, 0);
    expect(r.totalBolsas).toBe(12);
    expect(r.cantidadMetaKilos).toBe(12 / BOLSAS_PER_KG_META);
  });
});
