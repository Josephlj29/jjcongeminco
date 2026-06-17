/**
 * app/api/importaciones/saldos-iniciales/route.ts
 *
 * POST /api/importaciones/saldos-iniciales
 *
 * Recibe JSON { Modo, FechaDocumento, Filas[] } con CÓDIGOS naturales. El .xlsx
 * se parsea en el cliente (SheetJS). NO escribe T_SaldoStock directo: la función
 * inv.FnImportarSaldosIniciales genera documentos (existencia_inicial o ajuste)
 * que alimentan el ledger y, por trigger, el saldo y el costo promedio.
 *
 * Solo admin (catalogoAdmin). Cliente del usuario (RLS + auth.uid()).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ImportarSaldosSchema,
  puede,
  type ReporteImportacion,
} from "@congeminco/shared";

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("Solo administradores pueden importar saldos.", 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return respuestaError(
      "Se esperaba un cuerpo JSON con { Modo, FechaDocumento, Filas }.",
      400
    );
  }

  const parsed = ImportarSaldosSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError(
      "Formato del lote inválido.",
      400,
      parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`)
    );
  }

  // NombreArchivo viaja dentro del PLote: la auditoría en T_Importacion la escribe
  // ahora la RPC en la misma transacción (C4), no este endpoint.
  const nombreArchivo =
    typeof (body as { NombreArchivo?: unknown }).NombreArchivo === "string"
      ? (body as { NombreArchivo: string }).NombreArchivo
      : "importacion-saldos.xlsx";

  const supabase = await crearClienteServidor();
  const { data, error: rpcError } = await supabase
    .schema("inv")
    .rpc("FnImportarSaldosIniciales", {
      PLote: { ...parsed.data, NombreArchivo: nombreArchivo },
    });

  if (rpcError) {
    return respuestaError(`No se pudo importar: ${rpcError.message}`, 500);
  }

  const reporte = data as ReporteImportacion;
  return NextResponse.json(reporte);
}
