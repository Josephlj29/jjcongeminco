/**
 * lib/imprimir-solicitud.ts — Documento imprimible de un requerimiento.
 *
 * Client-only, sin dependencias: trae el detalle del requerimiento, arma un HTML
 * autocontenido y abre el diálogo de impresión del navegador. Desde ahí el
 * usuario puede imprimir o "Guardar como PDF".
 */
import type { RequerimientoConDetalle } from "@congeminco/shared";

const ORIGEN: Record<string, string> = {
  planificado: "Planificado",
  presupuestado: "Presupuestado",
  desgaste_prematuro: "Desgaste prematuro",
};
const SITUACION: Record<string, string> = {
  pendiente: "Pendiente",
  atendido: "Atendido",
  anulado: "Anulado",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function construirHtml(r: RequerimientoConDetalle): string {
  const filas = r.Detalle.map(
    (l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mono">${esc(l.Sku)}</td>
        <td>${esc(l.NombreProducto)}</td>
        <td>${esc(l.Placa ?? r.Placa ?? "—")}</td>
        <td class="c">${esc(l.Cantidad)}</td>
        <td class="c">${esc(l.CantidadAtendida)}</td>
        <td>${esc(l.Notas ?? "")}</td>
      </tr>`
  ).join("");

  const destino = r.Placa
    ? `Placa ${esc(r.Placa)}`
    : r.NombreEquipo
      ? esc(r.NombreEquipo)
      : "—";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Solicitud ${esc(r.NumeroRequerimiento ?? r.Id.slice(0, 8))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .empresa { font-size: 18px; font-weight: 700; }
  .sub { color: #555; }
  h1 { font-size: 15px; margin: 16px 0 4px; }
  .meta { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .meta td { padding: 3px 6px; vertical-align: top; }
  .meta .k { color: #555; width: 120px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { border: 1px solid #999; padding: 5px 7px; text-align: left; }
  table.items th { background: #f1f1f1; }
  td.c, th.c { text-align: center; }
  .mono { font-family: "Courier New", monospace; }
  .notas { margin-top: 12px; }
  .firmas { display: flex; gap: 60px; margin-top: 56px; }
  .firma { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; color: #555; }
  .pie { margin-top: 24px; color: #888; font-size: 10px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <img src="${window.location.origin}/logo.svg" alt="JJ Congeminco" style="height:58px" />
    </div>
    <div style="text-align:right">
      <div style="font-weight:700">SOLICITUD DE REQUERIMIENTO</div>
      <div class="mono">N° ${esc(r.NumeroRequerimiento ?? r.Id.slice(0, 8))}</div>
    </div>
  </div>

  <table class="meta">
    <tr>
      <td class="k">Fecha</td><td>${fecha(r.FechaRequerimiento)}</td>
      <td class="k">Situación</td><td>${esc(SITUACION[r.Situacion] ?? r.Situacion)}</td>
    </tr>
    <tr>
      <td class="k">Origen</td><td>${esc(ORIGEN[r.Origen] ?? r.Origen)}</td>
      <td class="k">Destino</td><td>${destino}</td>
    </tr>
    <tr>
      <td class="k">Solicitante</td>
      <td colspan="3">${
        r.NombreSolicitante
          ? esc(r.NombreSolicitante) +
            (r.CargoSolicitante ? ` (${esc(r.CargoSolicitante)})` : "")
          : "—"
      }</td>
    </tr>
  </table>

  <h1>Materiales solicitados</h1>
  <table class="items">
    <thead>
      <tr>
        <th class="c">#</th>
        <th>SKU</th>
        <th>Producto</th>
        <th>Placa</th>
        <th class="c">Cant. solicitada</th>
        <th class="c">Cant. atendida</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>${filas || '<tr><td colspan="7" class="c">Sin líneas</td></tr>'}</tbody>
  </table>

  ${r.Notas ? `<div class="notas"><strong>Observaciones:</strong> ${esc(r.Notas)}</div>` : ""}

  <div class="firmas">
    <div class="firma">Solicitado por${
      r.NombreSolicitante
        ? `<br/><span style="color:#111">${esc(r.NombreSolicitante)}</span>`
        : ""
    }</div>
    <div class="firma">Aprobado por</div>
    <div class="firma">Recibido por</div>
  </div>

  <div class="pie">Documento generado desde el sistema de inventario JJ Congeminco.</div>
</body>
</html>`;
}

/** Trae el requerimiento y abre el diálogo de impresión con el documento. */
export async function imprimirSolicitudRequerimiento(id: string): Promise<void> {
  const res = await fetch(`/api/requerimientos/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo cargar el requerimiento.");
  }
  const r = (await res.json()) as RequerimientoConDetalle;

  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    throw new Error("Permite las ventanas emergentes para generar el PDF.");
  }
  win.document.open();
  win.document.write(construirHtml(r));
  win.document.close();
  win.focus();
  // Pequeña espera para que el navegador renderice antes de imprimir.
  setTimeout(() => win.print(), 300);
}
