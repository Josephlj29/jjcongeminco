import { describe, it, expect } from "vitest";
import { CrearDocumentoSchema, SITUACION_REQUERIMIENTO } from "./dto";

const UUID = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";

describe("CrearDocumentoSchema", () => {
  it("acepta una entrada válida", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "entrada",
      FechaDocumento: "2026-08-28",
      IdUbicacionDestino: UUID,
      Detalle: [{ IdProducto: UUID, Cantidad: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza transferencia con origen == destino", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "transferencia",
      FechaDocumento: "2026-08-28",
      IdUbicacionOrigen: UUID,
      IdUbicacionDestino: UUID,
      Detalle: [{ IdProducto: UUID, Cantidad: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza salida sin placa por línea (IdVehiculo)", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "salida",
      FechaDocumento: "2026-08-28",
      IdUbicacionOrigen: UUID,
      Detalle: [{ IdProducto: UUID, Cantidad: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("acepta salida con placa en cada línea", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "salida",
      FechaDocumento: "2026-08-28",
      IdUbicacionOrigen: UUID,
      Detalle: [{ IdProducto: UUID, Cantidad: 1, IdVehiculo: UUID2 }],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza cantidad no positiva", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "entrada",
      FechaDocumento: "2026-08-28",
      IdUbicacionDestino: UUID,
      Detalle: [{ IdProducto: UUID, Cantidad: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza detalle vacío", () => {
    const r = CrearDocumentoSchema.safeParse({
      TipoDocumento: "entrada",
      FechaDocumento: "2026-08-28",
      IdUbicacionDestino: UUID,
      Detalle: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("SITUACION_REQUERIMIENTO", () => {
  it("incluye el estado parcial", () => {
    expect(SITUACION_REQUERIMIENTO).toContain("parcial");
    expect(SITUACION_REQUERIMIENTO).toEqual(["pendiente", "parcial", "atendido", "anulado"]);
  });
});
