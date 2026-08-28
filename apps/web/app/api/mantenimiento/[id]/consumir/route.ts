/**
 * app/api/mantenimiento/[id]/consumir/route.ts
 *
 * POST /api/mantenimiento/:id/consumir — registra los repuestos usados y genera
 * la salida de inmediato (consumo provisional, Model 2). La OT pasa a 'consumida'.
 * Rol: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ConsumirRepuestosSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para consumir repuestos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ConsumirRepuestosSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnConsumirRepuestosOrdenMantenimiento", {
      PIdOrden: id,
      PConsumo: parsed.data,
    });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ IdDocumentoInventario: data as string }, { status: 201 });
}
