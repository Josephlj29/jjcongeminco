/**
 * app/api/ubicaciones/route.ts
 *
 * GET  /api/ubicaciones — lista de ubicaciones activas (inv.T_Ubicacion)
 * POST /api/ubicaciones — crea ubicación (rol: catalogoAdmin = solo admin)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearUbicacionSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Ubicacion")
    .select("Id, Codigo, Nombre, Tipo, Direccion, Estado")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para crear ubicaciones.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearUbicacionSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Ubicacion")
    .insert({
      Codigo: parsed.data.Codigo,
      Nombre: parsed.data.Nombre,
      Tipo: parsed.data.Tipo,
      Direccion: parsed.data.Direccion ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
