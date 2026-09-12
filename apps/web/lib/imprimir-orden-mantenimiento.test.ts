import { describe, expect, it } from "vitest";
import type { OrdenMantenimientoConDetalle, TrabajoMantenimiento } from "@congeminco/shared";
import { construirHtml } from "./imprimir-orden-mantenimiento";

const FOTO_A = "https://abc.supabase.co/storage/v1/object/public/mantenimiento/trabajos/a.jpg";
const FOTO_D = "https://abc.supabase.co/storage/v1/object/public/mantenimiento/trabajos/d.jpg";
const ORIGEN = { origen: "https://app.test" };

function trabajo(p: Partial<TrabajoMantenimiento> & { Secuencia: number }): TrabajoMantenimiento {
  return {
    Id: `t-${p.Secuencia}`,
    Descripcion: `Trabajo ${p.Secuencia}`,
    UrlFotoAntes: null,
    UrlFotoDespues: null,
    ...p,
  };
}

function orden(over: Partial<OrdenMantenimientoConDetalle> = {}): OrdenMantenimientoConDetalle {
  return {
    Id: "11111111-2222-3333-4444-555555555555",
    NumeroOrden: "PREV-01092026-ABC123-01",
    FechaOrden: "2026-09-01",
    TipoMantenimiento: "preventivo",
    Turno: "dia",
    Kilometraje: 1200,
    Horometro: null,
    IdVehiculo: "veh-1",
    Placa: "ABC-123",
    Personales: [],
    Situacion: "abierta",
    StockDescontado: false,
    TieneRepuestos: false,
    Observaciones: null,
    IdRequerimiento: null,
    IdDocumentoInventarioReversa: null,
    MotivoReconciliacion: null,
    FechaReconciliacion: null,
    IdUbicacionConsumo: null,
    IdProveedorCompra: null,
    ComprobanteCompra: null,
    Trabajos: [],
    Repuestos: [],
    ...over,
  };
}

function contar(html: string, aguja: string): number {
  return html.split(aguja).length - 1;
}

/** Recorta la tabla TRABAJOS REALIZADOS (hasta OBSERVACIONES) para contar sus filas. */
function tablaTrabajos(html: string): string {
  const desde = html.indexOf("<h2>TRABAJOS REALIZADOS</h2>");
  const hasta = html.indexOf("<h2>OBSERVACIONES</h2>");
  return html.slice(desde, hasta);
}

describe("construirHtml — anexo de evidencia fotográfica", () => {
  it("sin fotos no agrega anexo ni tags y conserva las 8 filas mínimas de trabajos", () => {
    const html = construirHtml(orden({ Trabajos: [trabajo({ Secuencia: 1 })] }), ORIGEN);

    expect(html).not.toContain("EVIDENCIA FOTOGRÁFICA");
    expect(html).not.toContain('class="anexo"');
    expect(html).not.toContain("Ver anexo");
    expect(contar(tablaTrabajos(html), "<tr><td")).toBe(8);
  });

  it("con foto de antes y después arma un bloque con ambas imágenes", () => {
    const html = construirHtml(
      orden({
        Trabajos: [
          trabajo({
            Secuencia: 1,
            Descripcion: "Cambio de filtro",
            UrlFotoAntes: FOTO_A,
            UrlFotoDespues: FOTO_D,
          }),
        ],
      }),
      ORIGEN,
    );

    expect(html).toContain("EVIDENCIA FOTOGRÁFICA");
    expect(contar(html, 'class="ev-item"')).toBe(1);
    expect(html).toContain(`src="${FOTO_A}"`);
    expect(html).toContain(`src="${FOTO_D}"`);
    expect(html).not.toContain('class="ev-slot ev-vacio"');
    expect(html).toContain("ANTES");
    expect(html).toContain("DESPUÉS");
    expect(html).toContain("Ítem 1 — Cambio de filtro");
  });

  it("con una sola foto deja el otro lado como 'Sin foto' manteniendo la grilla", () => {
    const html = construirHtml(
      orden({ Trabajos: [trabajo({ Secuencia: 1, UrlFotoAntes: FOTO_A })] }),
      ORIGEN,
    );

    expect(contar(html, "<img")).toBe(2); // logo + la única foto
    expect(contar(html, 'class="ev-slot ev-vacio"')).toBe(1);
    expect(html).toContain("Sin foto");
    expect(html.indexOf("DESPUÉS")).toBeLessThan(html.indexOf('class="ev-slot ev-vacio"'));
  });

  it("lista en el anexo solo los trabajos con foto y marca esas filas con 'Ver anexo'", () => {
    const html = construirHtml(
      orden({
        Trabajos: [
          trabajo({ Secuencia: 1 }),
          trabajo({ Secuencia: 2, UrlFotoDespues: FOTO_D }),
          trabajo({ Secuencia: 3 }),
        ],
      }),
      ORIGEN,
    );

    expect(contar(html, 'class="ev-item"')).toBe(1);
    expect(html).toContain("Ítem 2 — Trabajo 2");
    expect(contar(html, "Ver anexo")).toBe(1);
    expect(html).toMatch(
      /<tr><td class="c">2<\/td><td>Trabajo 2 <span class="tag">Ver anexo<\/span>/,
    );
    expect(html).toMatch(/<tr><td class="c">1<\/td><td>Trabajo 1<\/td>/);
    expect(html).toMatch(/<tr><td class="c">3<\/td><td>Trabajo 3<\/td>/);
  });

  it("escapa comillas y etiquetas en URLs y descripciones (atributos y texto)", () => {
    const html = construirHtml(
      orden({
        Trabajos: [
          trabajo({
            Secuencia: 1,
            Descripcion: '<b>x</b> "q"',
            UrlFotoAntes: 'https://x.test/a".jpg',
          }),
        ],
      }),
      ORIGEN,
    );

    expect(html).toContain('src="https://x.test/a&quot;.jpg"');
    expect(html).not.toContain('a".jpg');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &quot;q&quot;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("rechaza URLs que no sean http(s) y las trata como 'sin foto'", () => {
    const html = construirHtml(
      orden({
        Trabajos: [
          trabajo({ Secuencia: 1, UrlFotoAntes: "javascript:alert(1)" }),
          trabajo({ Secuencia: 2, UrlFotoAntes: "data:image/png;base64,AAAA" }),
          trabajo({ Secuencia: 3, UrlFotoDespues: "/relativa.jpg" }),
        ],
      }),
      ORIGEN,
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
    expect(html).not.toContain("relativa.jpg");
    expect(html).not.toContain("EVIDENCIA FOTOGRÁFICA");
    expect(html).not.toContain("Ver anexo");
  });

  it("imprime la FechaOrden como día calendario, sin desfase por zona horaria", () => {
    const html = construirHtml(orden({ FechaOrden: "2026-09-11" }), ORIGEN);

    expect(html).toContain("<td>11/09/2026</td>");
    expect(html).not.toContain("10/09/2026");
  });

  it("usa el origen inyectado para el logo en vez de window", () => {
    const html = construirHtml(orden(), ORIGEN);

    expect(html).toContain('src="https://app.test/logo.svg"');
    expect(html).not.toContain("undefined/logo.svg");
  });

  it("declara la hoja A4 y las reglas de corte de página", () => {
    const html = construirHtml(orden(), ORIGEN);

    expect(html).toMatch(/@page\s*\{\s*size:\s*A4;\s*margin:\s*12mm/);
    expect(html).toMatch(/@media print\s*\{[^}]*body\s*\{\s*margin:\s*0/);
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("break-before: page");
  });

  it("las columnas del anexo no pueden desbordar la hoja por el ancho intrínseco de la foto", () => {
    const html = construirHtml(orden(), ORIGEN);

    expect(html).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
    expect(html).toMatch(/\.ev-foto\s*\{[^}]*min-width:\s*0/);
    expect(html).toMatch(/\.ev-slot img\s*\{[^}]*max-width:\s*100%/);
  });

  it("no usa carga diferida ni handlers inline en las imágenes del documento", () => {
    const html = construirHtml(
      orden({
        Trabajos: [trabajo({ Secuencia: 1, UrlFotoAntes: FOTO_A, UrlFotoDespues: FOTO_D })],
      }),
      ORIGEN,
    );

    expect(html).not.toContain('loading="lazy"');
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain("crossorigin");
  });
});
