/**
 * app/api/personal/[id]/route.ts
 *
 * PATCH  /api/personal/:id — actualiza personal (rol: catalogoAdmin = admin)
 * DELETE /api/personal/:id — soft-delete; bloquea si es solicitante de requerimientos.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ActualizarPersonalSchema, puede } from "@congeminco/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para editar personal.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarPersonalSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }
  if (Object.keys(parsed.data).length === 0) {
    return respuestaError("No se enviaron campos para actualizar.", 400);
  }

  const supabase = await crearClienteServidor();
  // IdUsuario opcional: "" o ausente → null (desvincular).
  const payload = {
    ...parsed.data,
    ...(parsed.data.IdUsuario !== undefined
      ? { IdUsuario: parsed.data.IdUsuario || null }
      : {}),
  };

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Personal")
    .update(payload)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    const dup = /UQ_T_Personal_IdUsuario|duplicate key/i.test(dbError.message);
    return NextResponse.json(
      { error: dup ? "Ese usuario ya está vinculado a otro personal." : dbError.message },
      { status: dup ? 409 : 500 }
    );
  }
  if (!data) return respuestaError("Personal no encontrado.", 404);
  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para eliminar personal.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: deps, error: depsError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: "personal", PId: id });

  if (depsError) {
    return NextResponse.json({ error: depsError.message }, { status: 500 });
  }
  const depData = deps as { puedeEliminar: boolean } | null;
  if (depData && depData.puedeEliminar === false) {
    return NextResponse.json(
      { error: "No se puede eliminar: es solicitante de requerimientos.", dependencias: deps },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .schema("inv")
    .from("T_Personal")
    .update({ Estado: false })
    .eq("Id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
