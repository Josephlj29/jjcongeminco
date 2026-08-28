/**
 * lib/exportar-xlsx.ts — Exportación de reportes a .xlsx en el navegador.
 *
 * Client-only. SheetJS se carga de forma diferida (dynamic import) para no
 * engordar el bundle: el peso solo viaja cuando el usuario exporta. Espejo del
 * contrato de lib/csv.ts (columnas {key,label}), pero admite múltiples hojas.
 */

interface ColumnaDef {
  key: string;
  label: string;
}

interface HojaExcel {
  nombre: string;
  columnas: ColumnaDef[];
  filas: Record<string, unknown>[];
}

export async function exportarExcel(nombreArchivo: string, hojas: HojaExcel[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const hoja of hojas) {
    // Proyectar cada fila al orden/labels de las columnas declaradas.
    const filasProyectadas = hoja.filas.map((fila) => {
      const obj: Record<string, unknown> = {};
      for (const col of hoja.columnas) {
        obj[col.label] = fila[col.key] ?? "";
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(filasProyectadas, {
      header: hoja.columnas.map((c) => c.label),
    });
    // Sanitizar los nombres de hoja (Excel: máx 31 chars, sin : \ / ? * [ ]).
    const nombreHoja = hoja.nombre.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Hoja1";
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  }

  XLSX.writeFile(wb, nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`);
}
