/**
 * app/api/lineas-equipo/[id]/route.ts
 *
 * PATCH  /api/lineas-equipo/:id — actualiza una línea (rol: catalogoAdmin = admin)
 * DELETE /api/lineas-equipo/:id — soft-delete (Estado=false). Bloquea si tiene
 *   tipos de equipo colgados, vía FnEliminarConDependencias('lineaEquipo').
 *
 * Por qué bloquea: T_TipoEquipo.IdLinea es NOT NULL. Dar de baja una línea con
 * tipos vivos dejaría esos tipos apuntando a una línea inactiva, y el filtro de
 * compatibilidad (placa -> equipo -> tipo) empezaría a esconder productos sin
 * que nadie se entere. Es el mismo bug que tenía "LIN LIV - CAMIONES".
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  autenticarRequest,
  mapearErrorNegocio,
  respuestaError,
  respuestaErrorBD,
} from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ActualizarLineaEquipoSchema, puede } from "@congeminco/shared";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para editar líneas de equipo.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarLineaEquipoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }
  if (Object.keys(parsed.data).length === 0) {
    return respuestaError("No se enviaron campos para actualizar.", 400);
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_LineaEquipo")
    .update(parsed.data)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    return respuestaErrorBD(dbError, "El código ya está en uso por una línea activa.");
  }
  if (!data) {
    return respuestaError("Línea de equipo no encontrada.", 404);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para eliminar líneas de equipo.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: resultado, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnEliminarConDependencias", { PEntidad: "lineaEquipo", PId: id });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }
  const res = resultado as { ok: boolean; dependencias?: unknown };
  if (!res?.ok) {
    return NextResponse.json(
      {
        error: "No se puede eliminar: tiene tipos de equipo colgados.",
        dependencias: res?.dependencias,
      },
      { status: 409 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
