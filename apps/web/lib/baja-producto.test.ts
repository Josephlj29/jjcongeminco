import { describe, it, expect } from "vitest";
import { accionesDeBaja } from "./baja-producto";

describe("accionesDeBaja", () => {
  const activo = { StockTotal: 0, DadoDeBaja: false };

  it("admin con saldo 0: puede dar de baja", () => {
    expect(accionesDeBaja(activo, "admin")).toEqual({ darDeBaja: true, reactivar: false });
  });

  it("admin con saldo: NO puede dar de baja (primero se pasa el stock al producto bueno)", () => {
    expect(accionesDeBaja({ StockTotal: 3, DadoDeBaja: false }, "admin").darDeBaja).toBe(false);
  });

  it("saldo negativo tampoco es 0: no se da de baja", () => {
    expect(accionesDeBaja({ StockTotal: -1, DadoDeBaja: false }, "admin").darDeBaja).toBe(false);
  });

  it("almacenero con saldo 0: no ve ninguna acción", () => {
    expect(accionesDeBaja(activo, "almacenero")).toEqual({ darDeBaja: false, reactivar: false });
  });

  it("producto ya dado de baja: admin puede reactivarlo, no darlo de baja otra vez", () => {
    expect(accionesDeBaja({ StockTotal: 0, DadoDeBaja: true }, "admin")).toEqual({
      darDeBaja: false,
      reactivar: true,
    });
  });

  it("sin rol: nada", () => {
    expect(accionesDeBaja(activo, null)).toEqual({ darDeBaja: false, reactivar: false });
  });

  it("DadoDeBaja ausente (respuesta vieja de la API) se trata como activo", () => {
    expect(accionesDeBaja({ StockTotal: 0 }, "admin").darDeBaja).toBe(true);
  });
});
