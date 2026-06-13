/**
 * app/api/requerimientos/[id]/atender/route.ts
 *
 * POST /api/requerimientos/:id/atender — aprueba el requerimiento: genera la
 * salida valorizada desde el almacén origen y lo marca atendido.
 * Body: { IdUbicacionOrigen: uuid, Notas?: string }
 * Rol: documentoEscritura (admin, almacenero, supervision).
 *
 * Errores de regla de negocio de la función (stock insuficiente, no pendiente)
 * se devuelven como 409 con el mensaje, no como 500.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AtenderRequerimientoSchema, puede } from "@congeminco/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoEscritura")) {
    return respuestaError("No tenés permiso para aprobar requerimientos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AtenderRequerimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnAtenderRequerimiento", {
      PIdRequerimiento: id,
      PIdUbicacionOrigen: parsed.data.IdUbicacionOrigen,
      PNotas: parsed.data.Notas ?? null,
    });

  if (dbError) {
    // Regla de negocio (no error de infraestructura) → 409. Stems robustos ante
    // reformulaciones del mensaje SQL; el guard del ledger usa ERRCODE 23514.
    const reglaNegocio =
      dbError.code === "23514" ||
      /stock insuficiente|pendiente|no existe|no tiene l[ií]neas|almac[eé]n/i.test(
        dbError.message
      );
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 409 : 500 }
    );
  }

  return NextResponse.json({ IdDocumentoInventario: data as string }, { status: 201 });
}
