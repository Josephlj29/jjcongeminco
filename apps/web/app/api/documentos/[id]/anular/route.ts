/**
 * app/api/documentos/[id]/anular/route.ts
 *
 * POST /api/documentos/:id/anular — anula un documento confirmado emitiendo su
 * documento inverso (el ledger es append-only: no se borra, se revierte).
 * Devuelve el Id del documento de reversa.
 *
 * Solo procede si nada de lo que movió se consumió; lo decide la BD.
 * Rol: documentoCorregir (solo admin).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AnularDocumentoSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoCorregir")) {
    return respuestaError("Solo un administrador puede anular un documento registrado.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AnularDocumentoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnAnularDocumentoInventario", { PIdDocumento: id, PMotivo: parsed.data.Motivo });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ ok: true, IdReversa: data as string | null });
}
