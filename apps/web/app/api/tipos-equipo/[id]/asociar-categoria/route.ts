/**
 * app/api/tipos-equipo/[id]/asociar-categoria/route.ts
 *
 * POST /api/tipos-equipo/:id/asociar-categoria
 * Body: { IdCategoria: number }
 * Llama a inv.FnAsociarCategoriaTipoEquipo y devuelve { insertados: number }.
 * Rol: productoEscritura (admin, almacenero).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AsociarCategoriaTipoEquipoSchema, puede } from "@congeminco/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para asociar categorías a tipos de equipo.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AsociarCategoriaTipoEquipoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnAsociarCategoriaTipoEquipo", {
      PIdCategoria: parsed.data.IdCategoria,
      PIdTipoEquipo: id,
    });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ insertados: data as number }, { status: 201 });
}
