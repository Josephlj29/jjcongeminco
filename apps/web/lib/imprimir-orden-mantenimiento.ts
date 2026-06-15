/**
 * lib/imprimir-orden-mantenimiento.ts — Documento imprimible de una OT.
 *
 * Client-only, sin dependencias: trae la OT, arma un HTML autocontenido que
 * replica el formato físico de MANTENIMIENTO y abre el diálogo de impresión.
 */
import type { OrdenMantenimientoConDetalle } from "@congeminco/shared";

const TURNO: Record<string, string> = {
  dia: "Día",
  tarde: "Tarde",
  noche: "Noche",
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

function chk(activo: boolean): string {
  return activo ? "☑" : "☐";
}

function construirHtml(o: OrdenMantenimientoConDetalle): string {
  // Las filas de trabajos completan hasta un mínimo visual de 8 (como el papel).
  const totalTrabajos = Math.max(o.Trabajos.length, 8);
  const trabajos = Array.from({ length: totalTrabajos }, (_, i) => {
    const t = o.Trabajos[i];
    return `<tr><td class="c">${i + 1}</td><td>${t ? esc(t.Descripcion) : "&nbsp;"}</td></tr>`;
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

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Mantenimiento ${esc(o.NumeroOrden ?? o.Id.slice(0, 8))}</title>
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
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <div class="head">
    <div style="font-size:18px;font-weight:700">JJ CONGEMINCO</div>
    <div style="text-align:right">
      <div style="font-weight:700">ORDEN DE MANTENIMIENTO</div>
      <div class="mono">N° ${esc(o.NumeroOrden ?? o.Id.slice(0, 8))}</div>
    </div>
  </div>

  <div class="titulo">MANTENIMIENTO</div>
  <div class="tipos">
    <span>${chk(o.TipoMantenimiento === "preventivo")} PREVENTIVO</span>
    <span>${chk(o.TipoMantenimiento === "correctivo")} CORRECTIVO</span>
  </div>

  <table class="meta">
    <tr>
      <td class="k">FECHA</td><td>${fecha(o.FechaOrden)}</td>
      <td class="k">KILOMETRAJE</td><td>${o.Kilometraje !== null ? esc(o.Kilometraje) : ""}</td>
    </tr>
    <tr>
      <td class="k">TURNO</td><td>${esc(TURNO[o.Turno] ?? o.Turno)}</td>
      <td class="k">PLACA</td><td>${esc(o.Placa ?? "—")}</td>
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

  <div class="firma">MECÁNICO RESPONSABLE${
    o.NombreMecanico ? `<br/><span style="color:#111">${esc(o.NombreMecanico)}</span>` : ""
  }</div>

  <div class="pie">
    <span><strong>Email:</strong> admingerencia@jjcongeminco.com</span>
    <span><strong>Teléfono:</strong> 969 007 983 - 922 760 732</span>
    <span><strong>Ubicación:</strong> Sol oeste 107, Cerro Colorado - Arequipa</span>
  </div>
</body>
</html>`;
}

/** Trae la OT y abre el diálogo de impresión con el documento. */
export async function imprimirOrdenMantenimiento(id: string): Promise<void> {
  const res = await fetch(`/api/mantenimiento/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo cargar la orden.");
  }
  const o = (await res.json()) as OrdenMantenimientoConDetalle;

  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) throw new Error("Permite las ventanas emergentes para generar el PDF.");
  win.document.open();
  win.document.write(construirHtml(o));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
