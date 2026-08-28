/**
 * app/api/personal/[id]/route.ts
 *
 * PATCH  /api/personal/:id — actualiza personal (rol: catalogoAdmin = admin)
 * DELETE /api/personal/:id — soft-delete; bloquea si es solicitante de requerimientos.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, mapearErrorNegocio, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ActualizarPersonalSchema, puede } from "@congeminco/shared";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  // parsed.data trae IdUsuario:null al desvincular (viaja como null), uuid al
  // vincular, o ausente si no se tocó. update() solo escribe las claves presentes.
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Personal")
    .update(parsed.data)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    const dup = /UQ_T_Personal_IdUsuario|duplicate key/i.test(dbError.message);
    return NextResponse.json(
      { error: dup ? "Ese usuario ya está vinculado a otro personal." : dbError.message },
      { status: dup ? 409 : 500 },
    );
  }
  if (!data) return respuestaError("Personal no encontrado.", 404);
  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para eliminar personal.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: resultado, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnEliminarConDependencias", { PEntidad: "personal", PId: id });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }
  const res = resultado as { ok: boolean; dependencias?: unknown };
  if (!res?.ok) {
    return NextResponse.json(
      {
        error: "No se puede eliminar: es solicitante de requerimientos.",
        dependencias: res?.dependencias,
      },
      { status: 409 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
