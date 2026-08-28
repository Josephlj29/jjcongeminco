import { describe, it, expect } from "vitest";
import { moneda, numero, fechaISO, fechaCorta, porcentaje } from "./format";

describe("moneda", () => {
  it("formatea con símbolo S/ y 2 decimales", () => {
    expect(moneda(1234.5)).toBe("S/ 1,234.50");
    expect(moneda(0)).toBe("S/ 0.00");
  });
});

describe("numero", () => {
  it("agrega separador de miles", () => {
    expect(numero(1234567)).toBe("1,234,567");
  });
});

describe("fechaISO", () => {
  it("devuelve YYYY-MM-DD", () => {
    expect(fechaISO(new Date("2026-08-28T12:00:00Z"))).toBe("2026-08-28");
  });
});

describe("fechaCorta", () => {
  it("formatea es-PE dd/mm/yyyy desde ISO", () => {
    expect(fechaCorta("2026-08-28T00:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("porcentaje", () => {
  it("convierte fracción a % entero por defecto", () => {
    expect(porcentaje(0.153)).toBe("15%");
    expect(porcentaje(-0.2)).toBe("-20%");
  });
});
