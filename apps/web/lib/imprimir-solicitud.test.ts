import { describe, expect, it } from "vitest";
import type { RequerimientoConDetalle, RequerimientoDetalleLinea } from "@congeminco/shared";
import { construirHtml } from "./imprimir-solicitud";

const ORIGEN = { origen: "https://app.test" };

function linea(p: Partial<RequerimientoDetalleLinea> = {}): RequerimientoDetalleLinea {
  return {
    Id: "l-1",
    IdProducto: "prod-1",
    NombreProducto: "Filtro de aceite",
    Sku: "FILTRO-002",
    Cantidad: 2,
    CantidadAtendida: 0,
    CostoPromedio: 25.5,
    IdVehiculo: null,
    Placa: null,
    Notas: null,
    DescripcionLibre: null,
    UrlFotoLibre: null,
    ...p,
  };
}

function requerimiento(over: Partial<RequerimientoConDetalle> = {}): RequerimientoConDetalle {
  return {
    Id: "11111111-2222-3333-4444-555555555555",
    NumeroRequerimiento: "REQ-0001",
    FechaRequerimiento: "2026-09-11",
    Origen: "planificado",
    Situacion: "pendiente",
    IdEquipo: null,
    NombreEquipo: null,
    IdVehiculo: "veh-1",
    Placa: "ABC-123",
    Solicitantes: [
      { Id: "s1", IdPersonal: "p1", NombreCompleto: "Juan Pérez", Cargo: "Mecánico", Orden: 1 },
    ],
    Notas: null,
    IdDocumentoInventario: null,
    Detalle: [linea()],
    ...over,
  };
}

describe("construirHtml — solicitud de requerimiento", () => {
  it("imprime la FechaRequerimiento como día calendario, sin desfase por zona horaria", () => {
    const html = construirHtml(requerimiento({ FechaRequerimiento: "2026-09-11" }), ORIGEN);

    expect(html).toContain("<td>11/09/2026</td>");
    expect(html).not.toContain("10/09/2026");
  });

  it("usa el origen inyectado para el logo en vez de window", () => {
    const html = construirHtml(requerimiento(), ORIGEN);

    expect(html).toContain('src="https://app.test/logo.svg"');
    expect(html).not.toContain("undefined/logo.svg");
  });

  it("muestra número, situación legible, destino por placa y las líneas del detalle", () => {
    const html = construirHtml(requerimiento(), ORIGEN);

    expect(html).toContain("N° REQ-0001");
    expect(html).toContain("<td>Pendiente</td>");
    expect(html).toContain("Placa ABC-123");
    expect(html).toContain("FILTRO-002");
    expect(html).toContain("Filtro de aceite");
    expect(html).toContain("Juan Pérez (Mecánico)");
  });

  it("marca las líneas sin catalogar y escapa el contenido libre", () => {
    const html = construirHtml(
      requerimiento({
        Detalle: [linea({ IdProducto: null, NombreProducto: '<b>Perno</b> "M8"', Sku: "" })],
      }),
      ORIGEN,
    );

    expect(html).toContain("&lt;b&gt;Perno&lt;/b&gt; &quot;M8&quot; (no catalogado)");
    expect(html).not.toContain("<b>Perno</b>");
  });

  it("sin líneas muestra el aviso en la tabla", () => {
    const html = construirHtml(requerimiento({ Detalle: [] }), ORIGEN);

    expect(html).toContain("Sin líneas");
  });
});
