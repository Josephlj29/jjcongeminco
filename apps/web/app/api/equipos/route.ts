/**
 * app/api/equipos/route.ts
 *
 * GET  /api/equipos — lista de equipos activos (inv.T_Equipo)
 * POST /api/equipos — crea equipo (rol: productoEscritura = admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearEquipoSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Equipo")
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

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para crear equipos.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearEquipoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Equipo")
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
