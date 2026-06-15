/**
 * lib/xlsx-cliente.ts — Lectura y plantillas .xlsx en el navegador.
 *
 * Client-only. SheetJS se carga de forma diferida (dynamic import) para que el
 * bundle pesado solo viaje cuando un admin realmente abre la importación.
 * La validación de negocio vive en el servidor: acá solo leemos celdas crudas.
 */

/** Lee la primera hoja de un .xlsx y devuelve las filas como objetos por encabezado. */
export async function leerFilasExcel(
  file: File
): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const primera = wb.SheetNames[0];
  if (!primera) return [];
  const hoja = wb.Sheets[primera];
  // defval:"" para no perder columnas vacías; raw:true conserva números/fechas.
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
    defval: "",
    raw: true,
  });
}

/** Genera y descarga una plantilla .xlsx con encabezados y filas de ejemplo. */
export async function descargarPlantillaExcel(
  nombreArchivo: string,
  encabezados: string[],
  ejemplos: Record<string, unknown>[]
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(ejemplos, { header: encabezados });
  XLSX.utils.book_append_sheet(wb, hoja, "Plantilla");
  XLSX.writeFile(
    wb,
    nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`
  );
}

/** Normaliza una celda a booleano (sí/si/x/true/1/general → true). */
export function celdaABool(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1;
  const s = String(valor ?? "").trim().toLowerCase();
  return ["si", "sí", "x", "true", "1", "verdadero", "general"].includes(s);
}

/** Convierte una celda a número finito, o null si no es válida. */
export function celdaANumero(valor: unknown): number | null {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? n : null;
}

/** Parte una celda multivalor ("CAMION;GRUA") en una lista de códigos. */
export function celdaALista(valor: unknown): string[] {
  return String(valor ?? "")
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
