/**
 * lib/historial-documentos.ts — lectura de los filtros del historial de documentos.
 *
 * Pura y sin Supabase: valida lo que llega por la URL antes de armar la
 * consulta, así un parámetro inválido se ignora en vez de devolver un 500.
 */
import { TIPO_DOCUMENTO, type TipoDocumento } from "@congeminco/shared";

export const LIMITE_HISTORIAL_DEFECTO = 20;
const LIMITE_HISTORIAL_MAXIMO = 100;

const SITUACIONES = ["confirmado", "anulado"] as const;
type SituacionFiltro = (typeof SITUACIONES)[number];

export interface FiltrosHistorial {
  pagina: number;
  limit: number;
  /** FechaDocumento (día contable), inclusive. "YYYY-MM-DD". */
  desde: string | null;
  hasta: string | null;
  tipo: TipoDocumento | null;
  situacion: SituacionFiltro | null;
  /** N° de documento, comprobante, referencia o notas. */
  q: string;
  registradoPor: string;
  idProducto: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enteroEnRango(valor: string | null, defecto: number, minimo: number, maximo: number) {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(Math.max(n, minimo), maximo);
}

/** Mismo criterio que /api/saldos: coma, paréntesis y comodines rompen el or=(...) de PostgREST. */
function limpiarTexto(texto: string | null): string {
  return (texto ?? "")
    .replace(/[,()%*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** "YYYY-MM-DD" que exista en el calendario; si no, null. */
function fechaValida(valor: string | null): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
    ? valor
    : null;
}

function deLista<T extends string>(lista: readonly T[], valor: string | null): T | null {
  return lista.includes(valor as T) ? (valor as T) : null;
}

export function leerFiltrosHistorial(params: URLSearchParams): FiltrosHistorial {
  let desde = fechaValida(params.get("desde"));
  let hasta = fechaValida(params.get("hasta"));
  // Las fechas ISO se ordenan como texto: un rango al revés se da vuelta.
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const idProducto = params.get("idProducto");

  return {
    pagina: enteroEnRango(params.get("pagina"), 1, 1, 100000),
    limit: enteroEnRango(params.get("limit"), LIMITE_HISTORIAL_DEFECTO, 1, LIMITE_HISTORIAL_MAXIMO),
    desde,
    hasta,
    tipo: deLista(TIPO_DOCUMENTO, params.get("tipo")),
    situacion: deLista(SITUACIONES, params.get("situacion")),
    q: limpiarTexto(params.get("q")),
    registradoPor: limpiarTexto(params.get("registradoPor")),
    idProducto: idProducto && UUID.test(idProducto) ? idProducto : null,
  };
}
