/**
 * app/api/categorias/[id]/route.ts
 *
 * PATCH  /api/categorias/:id — actualiza una categoría (rol: catalogoAdmin = admin)
 * DELETE /api/categorias/:id — soft-delete (Estado=false). Bloquea si tiene
 *   dependientes (productos o subcategorías) vía FnContarDependencias('categoria').
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ActualizarCategoriaSchema, puede } from "@congeminco/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para editar categorías.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarCategoriaSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }
  if (Object.keys(parsed.data).length === 0) {
    return respuestaError("No se enviaron campos para actualizar.", 400);
  }
  if (parsed.data.IdCategoriaPadre === id) {
    return respuestaError("Una categoría no puede ser su propia familia padre.", 400);
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Categoria")
    .update(parsed.data)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return respuestaError("Categoría no encontrada.", 404);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para eliminar categorías.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: deps, error: depsError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: "categoria", PId: id });

  if (depsError) {
    return NextResponse.json({ error: depsError.message }, { status: 500 });
  }

  const depData = deps as { puedeEliminar: boolean } | null;
  if (depData && depData.puedeEliminar === false) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene productos o subcategorías.", dependencias: deps },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .schema("inv")
    .from("T_Categoria")
    .update({ Estado: false })
    .eq("Id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
