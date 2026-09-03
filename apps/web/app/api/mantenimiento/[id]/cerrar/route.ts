/**
 * app/api/mantenimiento/[id]/cerrar/route.ts
 *
 * POST /api/mantenimiento/:id/cerrar — finaliza una OT ABIERTA:
 *   { Anular: false } → culmina. La BD decide el destino según los repuestos
 *                       cargados: con repuestos pasa a "por aprobar" (el stock se
 *                       descuenta recién al aprobar); sin repuestos, a cerrada.
 *                       Devuelve esa situación para que la UI diga adónde fue.
 *   { Anular: true }  → cancela (sin impacto en stock).
 * Para OTs ya "por aprobar", usar /reconciliar o /reabrir. Rol: requerimientoCrear.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FinalizarOrdenSchema, puede, type SituacionOrden } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { data, error: dbError } = parsed.data.Anular
    ? await supabase
        .schema("inv")
        .rpc("FnAnularOrdenMantenimiento", { PIdOrden: id, PMotivo: parsed.data.Motivo ?? null })
    : await supabase.schema("inv").rpc("FnCerrarOrdenMantenimiento", { PIdOrden: id });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  // Anular no devuelve nada; culminar devuelve la situación resultante.
  const situacion = parsed.data.Anular ? "anulada" : ((data as SituacionOrden | null) ?? null);
  return NextResponse.json({ ok: true, Situacion: situacion });
}
