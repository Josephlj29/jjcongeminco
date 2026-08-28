import { describe, it, expect } from "vitest";
import { mapearErrorNegocio } from "./api-auth";

describe("mapearErrorNegocio (mapeo por SQLSTATE)", () => {
  it("P0001 (RAISE plpgsql) → 409", () => {
    expect(mapearErrorNegocio({ code: "P0001", message: "Stock insuficiente" }).status).toBe(409);
  });

  it("23514 (CHECK, guard de stock) → 409", () => {
    expect(mapearErrorNegocio({ code: "23514", message: "check_violation" }).status).toBe(409);
  });

  it("42501 (RLS/permiso) → 403", () => {
    expect(mapearErrorNegocio({ code: "42501", message: "No tienes permiso" }).status).toBe(403);
  });

  it("23505 (duplicado) → 409", () => {
    expect(mapearErrorNegocio({ code: "23505", message: "duplicate key" }).status).toBe(409);
  });

  it("código desconocido → 500", () => {
    expect(mapearErrorNegocio({ code: "XX000", message: "internal" }).status).toBe(500);
  });

  it("sin código pero mensaje de negocio → 409 (fallback)", () => {
    expect(mapearErrorNegocio({ message: "El requerimiento no existe." }).status).toBe(409);
  });

  it("sin código y mensaje genérico → 500", () => {
    expect(mapearErrorNegocio({ message: "connection reset" }).status).toBe(500);
  });

  it("usa mensajeDuplicado en 23505", async () => {
    const res = mapearErrorNegocio(
      { code: "23505", message: "duplicate key" },
      { mensajeDuplicado: "El código ya está en uso." }
    );
    const body = await res.json();
    expect(body.error).toBe("El código ya está en uso.");
  });
});
