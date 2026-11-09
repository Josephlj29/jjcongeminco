import { describe, it, expect } from "vitest";
import { evaluarSimilares, type ProductoSimilar } from "./productos-similares";

const porNombre = (sku: string, similitud: number): ProductoSimilar => ({
  Id: `id-${sku}`,
  Sku: sku,
  Nombre: `Producto ${sku}`,
  CodigoProductoProveedor: null,
  Motivo: "nombre",
  Similitud: similitud,
});

const porCodigo = (sku: string, codigo: string): ProductoSimilar => ({
  Id: `id-${sku}`,
  Sku: sku,
  Nombre: `Producto ${sku}`,
  CodigoProductoProveedor: codigo,
  Motivo: "codigo",
  Similitud: 1,
});

describe("evaluarSimilares", () => {
  it("sin candidatos: deja crear sin preguntar", () => {
    expect(evaluarSimilares([])).toEqual({ accion: "crear", bloqueante: null, parecidos: [] });
  });

  it("solo parecidos por nombre: pregunta antes de crear", () => {
    const r = evaluarSimilares([porNombre("REP-001", 1), porNombre("CON-002", 0.9)]);
    expect(r.accion).toBe("confirmar");
    expect(r.bloqueante).toBeNull();
    expect(r.parecidos.map((p) => p.Sku)).toEqual(["REP-001", "CON-002"]);
  });

  it("mismo código de proveedor: bloquea y señala el producto que ya lo tiene", () => {
    const r = evaluarSimilares([porNombre("REP-001", 0.8), porCodigo("FILTRO-015", "13284")]);
    expect(r.accion).toBe("bloquear");
    expect(r.bloqueante?.Sku).toBe("FILTRO-015");
  });

  it("el bloqueante no se repite en la lista de parecidos", () => {
    const r = evaluarSimilares([porCodigo("FILTRO-015", "13284"), porNombre("REP-001", 0.8)]);
    expect(r.parecidos.map((p) => p.Sku)).toEqual(["REP-001"]);
  });

  it("ordena los parecidos de más a menos similar", () => {
    const r = evaluarSimilares([porNombre("A", 0.6), porNombre("B", 0.95), porNombre("C", 0.7)]);
    expect(r.parecidos.map((p) => p.Sku)).toEqual(["B", "C", "A"]);
  });
});
