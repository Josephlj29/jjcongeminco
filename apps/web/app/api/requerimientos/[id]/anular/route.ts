/**
 * app/api/requerimientos/[id]/anular/route.ts
 *
 * POST /api/requerimientos/:id/anular — rechaza un requerimiento pendiente.
 * Body: { Motivo?: string }
 * Rol: documentoEscritura (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AnularRequerimientoSchema, puede } from "@congeminco/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoEscritura")) {
    return respuestaError("No tienes permiso para rechazar requerimientos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AnularRequerimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase
    .schema("inv")
    .rpc("FnAnularRequerimiento", {
      PIdRequerimiento: id,
      PMotivo: parsed.data.Motivo ?? null,
    });

  if (dbError) {
    // Regla de negocio → 409. Stems robustos ante reformulaciones del mensaje SQL.
    const reglaNegocio = /pendiente|no existe/i.test(dbError.message);
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
