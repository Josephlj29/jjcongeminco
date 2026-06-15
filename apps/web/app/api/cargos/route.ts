/**
 * app/api/cargos/route.ts
 *
 * GET  /api/cargos — cargos activos (para el maestro y el select de personal)
 * POST /api/cargos — crea un cargo (rol: catalogoAdmin = admin)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearCargoSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Cargo")
    .select("Id, Codigo, Nombre, Descripcion")
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
    return respuestaError("No tienes permiso para crear cargos.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearCargoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Cargo")
    .insert({
      Codigo: parsed.data.Codigo,
      Nombre: parsed.data.Nombre,
      Descripcion: parsed.data.Descripcion ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
