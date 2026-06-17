/**
 * app/api/importaciones/productos/route.ts
 *
 * POST /api/importaciones/productos
 *
 * Recibe JSON { Modo, Filas[] } con CÓDIGOS naturales (no UUIDs). El .xlsx se
 * parsea en el cliente (SheetJS) y se envía ya tipado. La validación de negocio
 * (requeridos, códigos, invariante general XOR tipos, duplicados) y la escritura
 * atómica las hace inv.FnImportarProductos, que devuelve un reporte por fila.
 *
 * Solo admin (catalogoAdmin). Usa el cliente del usuario (RLS + auth.uid()),
 * NO service-role: la función respeta permisos y registra quién importó.
 *
 * GOTCHA: .schema("inv") OBLIGATORIO; el parámetro de la RPC es "PLote".
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ImportarProductosSchema,
  puede,
  type ReporteImportacion,
} from "@congeminco/shared";

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  // Importación masiva de catálogo: operación de administrador.
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("Solo administradores pueden importar productos.", 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return respuestaError("Se esperaba un cuerpo JSON con { Modo, Filas }.", 400);
  }

  const parsed = ImportarProductosSchema.safeParse(body);
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
      : "importacion-productos.xlsx";

  const supabase = await crearClienteServidor();
  const { data, error: rpcError } = await supabase
    .schema("inv")
    .rpc("FnImportarProductos", {
      PLote: { ...parsed.data, NombreArchivo: nombreArchivo },
    });

  if (rpcError) {
    return respuestaError(`No se pudo importar: ${rpcError.message}`, 500);
  }

  const reporte = data as ReporteImportacion;
  return NextResponse.json(reporte);
}
