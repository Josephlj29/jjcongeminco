/**
 * app/api/requerimientos/route.ts
 *
 * GET  /api/requerimientos — lista de requerimientos recientes (soporta ?limit=N)
 * POST /api/requerimientos — crea requerimiento vía RPC inv.FnRegistrarRequerimiento
 *
 * Rol requerido para POST: documentoEscritura (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearRequerimientoSchema, puede } from "@congeminco/shared";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const cantidad = parseInt(limitParam ?? "50", 10) || 50;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Requerimiento")
    .select(
      "Id, NumeroRequerimiento, FechaRequerimiento, Origen, IdEquipo, IdVehiculo, Situacion"
    )
    .eq("Estado", true)
    .order("FechaRequerimiento", { ascending: false })
    .limit(cantidad);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoEscritura")) {
    return respuestaError("No tienes permiso para crear requerimientos.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearRequerimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnRegistrarRequerimiento", { PRequerimiento: parsed.data });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ Id: data }, { status: 201 });
}
