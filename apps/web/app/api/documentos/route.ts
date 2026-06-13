/**
 * app/api/documentos/route.ts
 *
 * GET  /api/documentos — lista cabeceras recientes (soporta ?limit=N, máx 200)
 * POST /api/documentos — registra documento vía RPC inv.FnRegistrarDocumentoInventario
 *
 * GOTCHA: .rpc() también necesita .schema("inv") cuando la función
 * no está en el esquema "public".
 *
 * Rol requerido para POST: documentoEscritura (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearDocumentoSchema, puede } from "@congeminco/shared";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const cantidad = Math.min(parseInt(limitParam ?? "50", 10) || 50, 200);

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_DocumentoInventario")
    .select(
      "Id, TipoDocumento, FechaDocumento, NumeroDocumento, Comprobante, Referencia, Notas, Estado, FechaCreacion, UsuarioCreacion"
    )
    .order("FechaDocumento", { ascending: false })
    .order("FechaCreacion", { ascending: false })
    .limit(cantidad);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoEscritura")) {
    return respuestaError(
      "No tienes permiso para registrar documentos de inventario.",
      403
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearDocumentoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();

  // GOTCHA: .rpc() también necesita .schema("inv") para funciones fuera de "public"
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnRegistrarDocumentoInventario", {
      PDocumento: parsed.data,
    });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ Id: data }, { status: 201 });
}
