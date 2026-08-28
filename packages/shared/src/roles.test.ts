import { describe, it, expect } from "vitest";
import { puede, puedeVerModulo, MODULOS, ROLES } from "./roles";

describe("puede", () => {
  it("admin puede administrar el catálogo", () => {
    expect(puede(ROLES.ADMIN, "catalogoAdmin")).toBe(true);
  });

  it("almacenero NO puede administrar el catálogo (solo admin)", () => {
    expect(puede(ROLES.ALMACENERO, "catalogoAdmin")).toBe(false);
  });

  it("almacenero puede escribir productos", () => {
    expect(puede(ROLES.ALMACENERO, "productoEscritura")).toBe(true);
  });

  it("logistica (solo lectura) no puede escribir nada", () => {
    expect(puede(ROLES.LOGISTICA, "productoEscritura")).toBe(false);
    expect(puede(ROLES.LOGISTICA, "documentoEscritura")).toBe(false);
  });

  it("rol null/undefined nunca puede", () => {
    expect(puede(null, "productoEscritura")).toBe(false);
    expect(puede(undefined, "catalogoAdmin")).toBe(false);
  });

  it("separación de funciones: crear vs aprobar requerimientos", () => {
    // almacenero crea pero no aprueba; gerencia aprueba pero no crea.
    expect(puede(ROLES.ALMACENERO, "requerimientoCrear")).toBe(true);
    expect(puede(ROLES.ALMACENERO, "requerimientoAprobar")).toBe(false);
    expect(puede(ROLES.GERENCIA, "requerimientoAprobar")).toBe(true);
    expect(puede(ROLES.GERENCIA, "requerimientoCrear")).toBe(false);
  });
});

describe("puedeVerModulo", () => {
  it("true cuando el módulo está en la lista", () => {
    expect(puedeVerModulo([MODULOS.DASHBOARD, MODULOS.SALDOS], MODULOS.SALDOS)).toBe(true);
  });

  it("false cuando no está", () => {
    expect(puedeVerModulo([MODULOS.DASHBOARD], MODULOS.REPORTES)).toBe(false);
  });

  it("false con lista null/undefined", () => {
    expect(puedeVerModulo(null, MODULOS.DASHBOARD)).toBe(false);
    expect(puedeVerModulo(undefined, MODULOS.DASHBOARD)).toBe(false);
  });
});
