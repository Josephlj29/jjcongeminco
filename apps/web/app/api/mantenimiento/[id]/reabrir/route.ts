/**
 * app/api/mantenimiento/[id]/reabrir/route.ts
 *
 * POST /api/mantenimiento/:id/reabrir — devuelve una OT "por aprobar" al estado
 * abierta para que se corrija, conservando el borrador de repuestos.
 *
 * Es la salida intermedia que le faltaba al aprobador: rechazar es un veredicto
 * (anula la orden), mientras que devolver a abierta solo la saca de la bandeja de
 * aprobación. Solo aplica si la OT todavía no descontó stock.
 *
 * Rol: requerimientoAprobar (admin, gerencia, supervisión).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ReabrirOrdenSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoAprobar")) {
    return respuestaError("No tienes permiso para devolver órdenes a abierta.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ReabrirOrdenSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase.schema("inv").rpc("FnReabrirOrdenMantenimiento", {
    PIdOrden: id,
    PMotivo: parsed.data.Motivo ?? null,
  });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ ok: true });
}
