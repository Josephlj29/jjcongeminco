/**
 * lib/imprimir-orden-mantenimiento.ts — Documento imprimible de una OT.
 *
 * Client-only, sin dependencias: trae la OT, arma un HTML autocontenido que
 * replica el formato físico de MANTENIMIENTO y abre el diálogo de impresión.
 *
 * La hoja 1 es la réplica del formato físico. Si algún trabajo registró fotos
 * de evidencia, se agrega un anexo "EVIDENCIA FOTOGRÁFICA" en hoja nueva, con
 * las fotos de antes/después a un tamaño legible en A4 (dos por fila, ~9 cm de
 * ancho, tres trabajos por hoja). Las fotos se esperan antes de imprimir.
 *
 * `construirHtml` es pura (sin `window`) para poder testearla en node; lo común
 * con los otros documentos (escape, espera de imágenes, ventana) vive en
 * `lib/imprimir.ts`.
 */
import type { OrdenMantenimientoConDetalle, TrabajoMantenimiento } from "@congeminco/shared";
import { fechaCorta } from "@/lib/format";
import { abrirDocumentoImpresion, esc } from "@/lib/imprimir";

const TURNO: Record<string, string> = {
  dia: "Día",
  tarde: "Tarde",
  noche: "Noche",
};

function chk(activo: boolean): string {
  return activo ? "☑" : "☐";
}

/** Solo URLs http(s) absolutas van a un <img>; cualquier otra cosa cuenta como "sin foto". */
function urlFotoValida(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const protocolo = new URL(u).protocol;
    return protocolo === "https:" || protocolo === "http:" ? u : null;
  } catch {
    return null;
  }
}

function tieneEvidencia(t: TrabajoMantenimiento): boolean {
  return urlFotoValida(t.UrlFotoAntes) !== null || urlFotoValida(t.UrlFotoDespues) !== null;
}

/**
 * Anexo de evidencia: solo los trabajos con al menos una foto válida. Devuelve ""
 * si no hay ninguno (el documento queda igual que sin anexo). El número de ítem
 * es el mismo índice que imprime la tabla TRABAJOS REALIZADOS, para que crucen.
 */
export function construirAnexoEvidencia(
  trabajos: TrabajoMantenimiento[],
  encabezado: { numeroOrden: string; placa: string | null },
): string {
  const conFotos = trabajos
    .map((t, i) => ({ t, numero: i + 1 }))
    .filter(({ t }) => tieneEvidencia(t));
  if (!conFotos.length) return "";

  // Sin loading="lazy" (tienen que cargar antes de imprimir) y sin onerror inline:
  // la foto rota se marca desde la ventana padre (ver alFallarImagen al imprimir).
  const slot = (url: string | null, etiqueta: string, descripcion: string): string => {
    const u = urlFotoValida(url);
    const cuerpo = u
      ? `<img src="${esc(u)}" alt="${esc(`${etiqueta}: ${descripcion}`)}" /><span class="ev-msg">Foto no disponible</span>`
      : "Sin foto";
    return `<div class="ev-foto"><div class="ev-lbl">${etiqueta}</div><div class="ev-slot${u ? "" : " ev-vacio"}">${cuerpo}</div></div>`;
  };

  const items = conFotos
    .map(
      ({ t, numero }) => `<div class="ev-item">
      <div class="ev-cap">Ítem ${numero} — ${esc(t.Descripcion)}</div>
      <div class="ev-fotos">
        ${slot(t.UrlFotoAntes, "ANTES", t.Descripcion)}
        ${slot(t.UrlFotoDespues, "DESPUÉS", t.Descripcion)}
      </div>
    </div>`,
    )
    .join("");

  const placa = encabezado.placa ? ` · Placa ${esc(encabezado.placa)}` : "";
  return `<section class="anexo">
    <h2>EVIDENCIA FOTOGRÁFICA</h2>
    <div class="anexo-sub">Orden N° ${esc(encabezado.numeroOrden)}${placa} — fotos de antes y después de los trabajos que registraron evidencia.</div>
    ${items}
  </section>`;
}

export function construirHtml(
  o: OrdenMantenimientoConDetalle,
  opciones: { origen: string },
): string {
  const numero = o.NumeroOrden ?? o.Id.slice(0, 8);

  // Las filas de trabajos completan hasta un mínimo visual de 8 (como el papel).
  // Las que tienen foto llevan un tag que remite al anexo.
  const totalTrabajos = Math.max(o.Trabajos.length, 8);
  const trabajos = Array.from({ length: totalTrabajos }, (_, i) => {
    const t = o.Trabajos[i];
    const descripcion = t
      ? esc(t.Descripcion) + (tieneEvidencia(t) ? ' <span class="tag">Ver anexo</span>' : "")
      : "&nbsp;";
    return `<tr><td class="c">${i + 1}</td><td>${descripcion}</td></tr>`;
  }).join("");

  const totalRep = Math.max(o.Repuestos.length, 5);
  const repuestos = Array.from({ length: totalRep }, (_, i) => {
    const r = o.Repuestos[i];
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${r ? esc(r.NombreProducto) + (r.Sku ? ` <span class="mono" style="color:#888">(${esc(r.Sku)})</span>` : "") : "&nbsp;"}</td>
      <td class="c">${r ? esc(r.Cantidad) : "&nbsp;"}</td>
      <td class="c">${r ? esc(r.CodigoUnidad ?? "") : "&nbsp;"}</td>
    </tr>`;
  }).join("");

  const anexo = construirAnexoEvidencia(o.Trabajos, { numeroOrden: numero, placa: o.Placa });

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Mantenimiento ${esc(numero)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .titulo { text-align: center; font-weight: 700; letter-spacing: 2px; margin: 6px 0 14px; }
  .tipos { display: flex; gap: 28px; justify-content: center; margin-bottom: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  .meta td { border: 1px solid #111; padding: 6px 8px; }
  .meta .k { background: #f1f1f1; font-weight: 600; width: 110px; }
  h2 { font-size: 12px; margin: 16px 0 4px; letter-spacing: 1px; }
  table.items th, table.items td { border: 1px solid #111; padding: 5px 7px; text-align: left; }
  table.items th { background: #f1f1f1; }
  td.c, th.c { text-align: center; }
  .mono { font-family: "Courier New", monospace; }
  .obs { border: 1px solid #111; padding: 8px; min-height: 38px; margin-top: 4px; }
  .firma { margin-top: 48px; width: 280px; border-top: 1px solid #111; padding-top: 4px; text-align: center; color: #555; }
  .pie { margin-top: 26px; border-top: 1px solid #ccc; padding-top: 8px; color: #555; font-size: 10px; display: flex; gap: 22px; flex-wrap: wrap; }
  .tag { font-size: 9px; color: #555; border: 1px solid #999; border-radius: 3px; padding: 0 4px; margin-left: 6px; white-space: nowrap; vertical-align: middle; }

  /* Anexo de evidencia: hoja nueva al imprimir; en pantalla, separador punteado.
     A4 con márgenes de 12mm → 186mm útiles: dos slots de 90×66mm por trabajo,
     tres trabajos por hoja. Cada bloque es de alto fijo y no se parte entre hojas. */
  .anexo { margin-top: 28px; padding-top: 16px; border-top: 1px dashed #bbb; break-before: page; page-break-before: always; }
  .anexo h2 { margin: 0 0 4mm; }
  .anexo-sub { font-size: 10px; color: #555; margin-bottom: 3mm; }
  .ev-item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
  .ev-cap { font-size: 11px; font-weight: 600; line-height: 1.3; margin-bottom: 2mm; }
  /* minmax(0,1fr) + min-width:0: sin eso la columna no encoge por debajo del ancho
     intrínseco de la foto (1600px) y la columna DESPUÉS se sale de la hoja. */
  .ev-fotos { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 6mm; }
  .ev-foto { min-width: 0; }
  .ev-lbl { font-size: 10px; font-weight: 600; letter-spacing: 1px; color: #555; line-height: 1.3; margin-bottom: 1mm; }
  .ev-slot { height: 66mm; border: 1px solid #bbb; background: #f6f6f6; display: flex; align-items: center; justify-content: center; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ev-slot img { width: 100%; max-width: 100%; min-width: 0; height: 100%; object-fit: contain; display: block; }
  .ev-vacio { border-style: dashed; color: #999; font-size: 10px; }
  .ev-msg { display: none; color: #999; font-size: 10px; }
  .ev-slot.ev-error img { display: none; }
  .ev-slot.ev-error .ev-msg { display: block; }

  @page { size: A4; margin: 12mm; }
  @media print {
    body { margin: 0; } /* el margen lo pone @page; evita sumar 12mm + 12mm */
    .anexo { margin-top: 0; padding-top: 0; border-top: 0; }
  }
</style>
</head>
<body>
  <div class="head">
    <div>
      <img src="${esc(opciones.origen)}/logo.svg" alt="JJ Congeminco" style="height:58px" />
    </div>
    <div style="text-align:right">
      <div style="font-weight:700">ORDEN DE MANTENIMIENTO</div>
      <div class="mono">N° ${esc(numero)}</div>
    </div>
  </div>

  <div class="titulo">MANTENIMIENTO</div>
  <div class="tipos">
    <span>${chk(o.TipoMantenimiento === "preventivo")} PREVENTIVO</span>
    <span>${chk(o.TipoMantenimiento === "correctivo")} CORRECTIVO</span>
  </div>

  <table class="meta">
    <tr>
      <td class="k">FECHA</td><td>${fechaCorta(o.FechaOrden)}</td>
      <td class="k">KILOMETRAJE</td><td>${o.Kilometraje !== null ? esc(o.Kilometraje) : ""}</td>
    </tr>
    <tr>
      <td class="k">TURNO</td><td>${esc(TURNO[o.Turno] ?? o.Turno)}</td>
      <td class="k">PLACA</td><td>${esc(o.Placa ?? "—")}</td>
    </tr>
    <tr>
      <td class="k">HORÓMETRO</td><td>${o.Horometro !== null ? esc(o.Horometro) : ""}</td>
      <td class="k"></td><td></td>
    </tr>
  </table>

  <h2>TRABAJOS REALIZADOS</h2>
  <table class="items">
    <thead><tr><th class="c" style="width:40px">ITEM</th><th>DESCRIPCIÓN</th></tr></thead>
    <tbody>${trabajos}</tbody>
  </table>

  <h2>OBSERVACIONES</h2>
  <div class="obs">${esc(o.Observaciones ?? "")}</div>

  <h2>REPUESTOS UTILIZADOS</h2>
  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:40px">ITEM</th>
        <th>DETALLE</th>
        <th class="c" style="width:90px">CANTIDAD</th>
        <th class="c" style="width:70px">U.M</th>
      </tr>
    </thead>
    <tbody>${repuestos}</tbody>
  </table>

  <div class="firma">PERSONAL RESPONSABLE${
    o.Personales.length
      ? `<br/><span style="color:#111">${esc(
          o.Personales.map((p) => p.NombreCompleto ?? "")
            .filter(Boolean)
            .join(", "),
        )}</span>`
      : ""
  }</div>

  <div class="pie">
    <span><strong>Email:</strong> admingerencia@jjcongeminco.com</span>
    <span><strong>Teléfono:</strong> 969 007 983 - 922 760 732</span>
    <span><strong>Ubicación:</strong> Sol oeste 107, Cerro Colorado - Arequipa</span>
  </div>
${anexo}
</body>
</html>`;
}

/** Trae la OT y abre el diálogo de impresión con el documento (fotos ya cargadas). */
export async function imprimirOrdenMantenimiento(id: string): Promise<void> {
  const res = await fetch(`/api/mantenimiento/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo cargar la orden.");
  }
  const o = (await res.json()) as OrdenMantenimientoConDetalle;

  await abrirDocumentoImpresion(construirHtml(o, { origen: window.location.origin }), {
    // Una foto rota pasa a "Foto no disponible" sin colapsar el layout del anexo.
    alFallarImagen: (img) => img.closest(".ev-slot")?.classList.add("ev-error"),
  });
}
