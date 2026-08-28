/**
 * app/api/mantenimiento/[id]/reconciliar/route.ts
 *
 * POST /api/mantenimiento/:id/reconciliar — el admin ratifica el consumo:
 *   { Aprobar: true }  → cierra la OT.
 *   { Aprobar: false } → la anula y genera la entrada de reversa.
 * Rol: requerimientoAprobar (admin, gerencia, supervision). Creador ≠ aprobador.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ReconciliarOrdenSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoAprobar")) {
    return respuestaError("No tienes permiso para reconciliar órdenes.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ReconciliarOrdenSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase.schema("inv").rpc("FnReconciliarOrdenMantenimiento", {
    PIdOrden: id,
    PAprobar: parsed.data.Aprobar,
    PMotivo: parsed.data.Motivo ?? null,
  });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ ok: true });
}
