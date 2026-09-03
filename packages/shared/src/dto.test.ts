import { describe, it, expect } from "vitest";
import {
  ActualizarOrdenMantenimientoSchema,
  CrearDocumentoSchema,
  CrearOrdenMantenimientoSchema,
  DECIMALES_CANTIDAD,
  DetalleRequerimientoSchema,
  LineaConsumoSchema,
  LineaEntregaSchema,
  MAX_CANTIDAD,
  PASO_CANTIDAD,
  PASO_COSTO,
  SITUACION_REQUERIMIENTO,
} from "./dto";

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

/* Alta de OT en un paso: fotos opcionales por tarea + consumo opcional. */
describe("CrearOrdenMantenimientoSchema", () => {
  const base = {
    TipoMantenimiento: "preventivo",
    FechaOrden: "2026-09-03",
    Turno: "dia",
    IdVehiculo: UUID,
    IdsPersonal: [UUID2],
  };
  const FOTO = "https://x.supabase.co/storage/v1/object/public/mantenimiento/trabajos/a.jpg";

  it("acepta trabajos con y sin fotos por tarea", () => {
    const r = CrearOrdenMantenimientoSchema.safeParse({
      ...base,
      Trabajos: [
        { Secuencia: 1, Descripcion: "Cambio de filtro", UrlFotoAntes: FOTO, UrlFotoDespues: FOTO },
        { Secuencia: 2, Descripcion: "Ajuste de frenos" },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.Trabajos[0]?.UrlFotoAntes).toBe(FOTO);
      expect(r.data.Trabajos[0]?.UrlFotoDespues).toBe(FOTO);
      expect(r.data.Trabajos[1]?.UrlFotoAntes).toBeUndefined();
    }
  });

  it("rechaza una foto de tarea que no es URL", () => {
    const r = CrearOrdenMantenimientoSchema.safeParse({
      ...base,
      Trabajos: [{ Secuencia: 1, Descripcion: "Cambio de filtro", UrlFotoAntes: "foto.jpg" }],
    });
    expect(r.success).toBe(false);
  });

  it("acepta el alta sin Consumo (la OT nace por aprobar igual)", () => {
    const r = CrearOrdenMantenimientoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.Consumo).toBeUndefined();
  });

  it("acepta Consumo en modo stock y lo conserva en el resultado", () => {
    const r = CrearOrdenMantenimientoSchema.safeParse({
      ...base,
      Consumo: { IdUbicacionOrigen: UUID, Lineas: [{ IdProducto: UUID2, Cantidad: 2 }] },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.Consumo?.Lineas).toHaveLength(1);
      expect(r.data.Consumo?.Lineas[0]?.Modo).toBe("stock");
    }
  });

  it("rechaza Consumo con compra directa sin proveedor ni comprobante", () => {
    const r = CrearOrdenMantenimientoSchema.safeParse({
      ...base,
      Consumo: {
        IdUbicacionOrigen: UUID,
        Lineas: [{ IdProducto: UUID2, Cantidad: 1, Modo: "compra", Costo: 10 }],
      },
    });
    expect(r.success).toBe(false);
  });

  it("ActualizarOrdenMantenimientoSchema acepta Consumo (la edición reemplaza el borrador)", () => {
    const r = ActualizarOrdenMantenimientoSchema.safeParse({
      ...base,
      Consumo: { IdUbicacionOrigen: UUID, Lineas: [{ IdProducto: UUID2, Cantidad: 2 }] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.Consumo?.Lineas).toHaveLength(1);
  });
});

/* Precisión de cantidades y costos.
   Antes de esto, un 0.0004 pasaba la validación, Postgres lo redondeaba a 0.000
   al insertarlo en NUMERIC(14,3), eso violaba el CHECK de mayor a cero y el
   usuario terminaba viendo el texto crudo del constraint. */
describe("precisión de cantidad y costo", () => {
  it("el paso se deriva de los decimales declarados", () => {
    expect(PASO_CANTIDAD).toBe(10 ** -DECIMALES_CANTIDAD);
  });

  const linea = (Cantidad: number) => ({ IdProducto: UUID, Cantidad });

  it("acepta hasta 3 decimales en la cantidad", () => {
    for (const c of [1, 0.5, 0.25, 0.333, 1234.5]) {
      expect(DetalleRequerimientoSchema.safeParse(linea(c)).success).toBe(true);
    }
  });

  it("rechaza más de 3 decimales en vez de dejar que la BD redondee callada", () => {
    for (const c of [0.3333, 1.23456789, 0.0004]) {
      expect(DetalleRequerimientoSchema.safeParse(linea(c)).success).toBe(false);
    }
  });

  it("rechaza una cantidad que desborda NUMERIC(14,3)", () => {
    expect(DetalleRequerimientoSchema.safeParse(linea(MAX_CANTIDAD)).success).toBe(true);
    expect(DetalleRequerimientoSchema.safeParse(linea(1e12)).success).toBe(false);
  });

  it("aplica la misma regla al detalle de documento y al consumo de la OT", () => {
    expect(CrearDocumentoSchema.safeParse({
      TipoDocumento: "entrada",
      FechaDocumento: "2026-09-03",
      IdUbicacionDestino: UUID,
      Detalle: [linea(0.25)],
    }).success).toBe(true);
    expect(CrearDocumentoSchema.safeParse({
      TipoDocumento: "entrada",
      FechaDocumento: "2026-09-03",
      IdUbicacionDestino: UUID,
      Detalle: [linea(0.2555)],
    }).success).toBe(false);

    expect(LineaConsumoSchema.safeParse(linea(0.125)).success).toBe(true);
    expect(LineaConsumoSchema.safeParse(linea(0.1255)).success).toBe(false);
  });

  it("la línea de entrega sigue aceptando exactamente 0 (no entregar)", () => {
    const entrega = (Cantidad: number) => ({ IdDetalle: UUID, Cantidad });
    expect(LineaEntregaSchema.safeParse(entrega(0)).success).toBe(true);
    expect(LineaEntregaSchema.safeParse(entrega(2.5)).success).toBe(true);
    expect(LineaEntregaSchema.safeParse(entrega(2.5001)).success).toBe(false);
  });

  it("el costo admite 4 decimales y rechaza 5", () => {
    const conCosto = (Costo: number) => ({ IdDetalle: UUID, Cantidad: 1, Modo: "compra", Costo });
    expect(PASO_COSTO).toBe(0.0001);
    expect(LineaEntregaSchema.safeParse(conCosto(12.3456)).success).toBe(true);
    expect(LineaEntregaSchema.safeParse(conCosto(12.34567)).success).toBe(false);
  });
});
