/**
 * lib/csv.ts — Exportación de CSV con BOM UTF-8
 * Client-only: usa Blob + <a download>. No llamar en Server Components.
 */

interface ColumnaDef {
  key: string;
  label: string;
}

function escaparCeldaCsv(valor: unknown): string {
  let str = valor === null || valor === undefined ? "" : String(valor);
  // Anti CSV/formula injection: una celda que empieza con = + - @ TAB o CR se
  // ejecuta como fórmula al abrir el CSV en Excel/LibreOffice. Le anteponemos
  // una comilla simple para forzar que se trate como texto.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportarCsv(
  filas: Record<string, unknown>[],
  columnas: ColumnaDef[],
  nombreArchivo: string
): void {
  const encabezado = columnas.map((c) => escaparCeldaCsv(c.label)).join(",");
  const cuerpo = filas
    .map((fila) => columnas.map((c) => escaparCeldaCsv(fila[c.key])).join(","))
    .join("\n");

  const csv = `﻿${encabezado}\n${cuerpo}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
