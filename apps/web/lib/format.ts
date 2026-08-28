/**
 * lib/format.ts — Helpers de formato compartidos (es-PE).
 *
 * Fuente única para moneda/fechas/números: las páginas NO deben redefinir
 * estos helpers localmente.
 */

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

/** Date -> "2026-08-27" (para query params desde/hasta). */
export function fechaISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** ISO string o Date -> "27/08/2026". */
export function fechaCorta(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ISO string o Date -> "27/08/2026 14:30". */
export function fechaHora(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleString("es-PE", {
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
