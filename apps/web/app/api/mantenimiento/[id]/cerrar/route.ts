/**
 * app/api/mantenimiento/[id]/cerrar/route.ts
 *
 * POST /api/mantenimiento/:id/cerrar — finaliza una OT ABIERTA sin repuestos:
 *   { Anular: false } → cierra (solo mano de obra).
 *   { Anular: true }  → cancela (sin impacto en stock).
 * Para OTs ya consumidas, usar /reconciliar. Rol: requerimientoCrear.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FinalizarOrdenSchema, puede } from "@congeminco/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para finalizar órdenes.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = FinalizarOrdenSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = parsed.data.Anular
    ? await supabase
        .schema("inv")
        .rpc("FnAnularOrdenMantenimiento", { PIdOrden: id, PMotivo: parsed.data.Motivo ?? null })
    : await supabase
        .schema("inv")
        .rpc("FnCerrarOrdenMantenimiento", { PIdOrden: id });

  if (dbError) {
    const reglaNegocio = /abierta|no existe|repuestos|reconciliar/i.test(dbError.message);
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
