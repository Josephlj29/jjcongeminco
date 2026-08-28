/**
 * app/api/requerimientos/[id]/atender/route.ts
 *
 * POST /api/requerimientos/:id/atender — aprueba el requerimiento: genera la
 * salida valorizada desde el almacén origen y lo marca atendido.
 * Body: { IdUbicacionOrigen: uuid, Notas?: string }
 * Rol: requerimientoAprobar (admin, gerencia, supervision).
 *
 * Errores de regla de negocio de la función (stock insuficiente, no pendiente)
 * se devuelven como 409 con el mensaje, no como 500.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AtenderRequerimientoSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "requerimientoAprobar")) {
    return respuestaError("No tienes permiso para aprobar requerimientos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AtenderRequerimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase.schema("inv").rpc("FnAtenderRequerimiento", {
    PIdRequerimiento: id,
    PEntrega: parsed.data,
  });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ IdDocumentoInventario: data as string }, { status: 201 });
}
