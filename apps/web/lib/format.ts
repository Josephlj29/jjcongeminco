/**
 * lib/format.ts — Helpers de formato compartidos (es-PE, hora de Lima).
 *
 * Fuente única para moneda/fechas/números: las páginas NO deben redefinir
 * estos helpers localmente.
 *
 * ZONA HORARIA: la operación es en Perú, así que el DÍA CALENDARIO y lo que se
 * muestra se fijan en `America/Lima`, sin depender de la zona del dispositivo.
 * Ojo con `toISOString()`: devuelve UTC, y como Lima es UTC−5, entre las 19:00
 * y 23:59 hora Lima daba el día SIGUIENTE (bug de un día en FechaOrden /
 * FechaRequerimiento y en el N° de orden, que se arma desde la fecha).
 * Para eso está `hoyLima()`. En la BD el mismo criterio lo fija la migración
 * 0065 (TimeZone = America/Lima), y los TIMESTAMPTZ siguen guardando el
 * instante absoluto: la zona solo aplica al interpretar y mostrar.
 */

const ZONA = "America/Lima";

/* en-CA rinde YYYY-MM-DD, así que sirve para obtener la fecha ISO de una zona
   concreta sin depender del offset del dispositivo. */
const FMT_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 1234.5 -> "S/ 1,234.50" (formato histórico de la app, 2 decimales). */
export function moneda(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 1234.5 -> "1,234.5" (separador es-PE; decimales opcionales). */
export function numero(n: number, decimales?: number): string {
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales ?? 2,
  });
}

/** Date -> "2026-08-27" en hora de Lima (para query params y campos date). */
export function fechaISO(d: Date): string {
  return FMT_ISO.format(d);
}

/** Día calendario de HOY en Lima ("2026-08-27"). Usar en vez de `toISOString()`. */
export function hoyLima(): string {
  return FMT_ISO.format(new Date());
}

/* Columnas DATE de Postgres (FechaOrden, FechaDocumento, FechaRequerimiento)
   llegan como "YYYY-MM-DD" pelado. */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ISO string o Date -> "27/08/2026".
 *
 * Distingue los DOS tipos de dato, que necesitan tratamiento OPUESTO:
 *  - DATE ("2026-09-03"): es un DÍA CALENDARIO, se muestra tal cual. Convertirlo
 *    de zona lo corre: `new Date("2026-09-03")` es medianoche UTC y en Lima
 *    (UTC−5) cae el día ANTERIOR a las 19:00 — así se veía un día menos.
 *  - TIMESTAMPTZ ("2026-09-03T01:30:00Z"): es un INSTANTE, se convierte a Lima.
 */
export function fechaCorta(fecha: string | Date): string {
  if (typeof fecha === "string") {
    const m = SOLO_FECHA.exec(fecha.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`; // día calendario, sin tocar la zona
  }
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleDateString("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** ISO string o Date -> "27/08/2026 14:30" (hora de Lima). */
export function fechaHora(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleString("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 0.153 -> "15%" (deltas del dashboard; respeta el signo). */
export function porcentaje(n: number, decimales = 0): string {
  return `${(n * 100).toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  })}%`;
}
