/**
 * app/api/mantenimiento/[id]/reabrir/route.ts
 *
 * POST /api/mantenimiento/:id/reabrir — devuelve una OT al estado abierta para
 * que se corrija, conservando el borrador de repuestos.
 *
 * Desde "por aprobar" es la salida intermedia del aprobador: rechazar es un
 * veredicto (anula la orden), devolver a abierta solo la saca de la bandeja.
 * Desde "cerrada" deshace un cierre por error y es SOLO de admin (migración
 * 0074). En ningún caso aplica si la OT ya descontó stock.
 *
 * Rol: este guard deja pasar a requerimientoAprobar (admin, gerencia,
 * supervisión); el candado de admin para las cerradas lo pone la función de la
 * BD, que es la única que conoce la situación de la orden.
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
