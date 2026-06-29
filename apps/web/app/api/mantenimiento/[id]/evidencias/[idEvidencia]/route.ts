/**
 * app/api/mantenimiento/[id]/evidencias/[idEvidencia]/route.ts
 *
 * DELETE /api/mantenimiento/:id/evidencias/:idEvidencia — elimina una foto de evidencia.
 *
 * Rol requerido: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puede } from "@congeminco/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; idEvidencia: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para gestionar evidencia de mantenimiento.", 403);
  }

  const { idEvidencia } = await params;
  const supabase = await crearClienteServidor();

  const { error: dbError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoEvidencia")
    .delete()
    .eq("Id", idEvidencia);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
