/**
 * app/api/vehiculos/[id]/route.ts
 *
 * PATCH  /api/vehiculos/:id — actualiza un vehículo/placa (rol: admin, almacenero)
 * DELETE /api/vehiculos/:id — soft-delete (Estado=false, rol: admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ActualizarVehiculoSchema, puede } from "@congeminco/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para editar vehículos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarVehiculoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  if (Object.keys(parsed.data).length === 0) {
    return respuestaError("No se enviaron campos para actualizar.", 400);
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Vehiculo")
    .update(parsed.data)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (!data) {
    return respuestaError("Vehículo no encontrado.", 404);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para eliminar vehículos.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  // Guardia: verificar dependencias antes del soft-delete
  const { data: deps, error: depsError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: "vehiculo", PId: id });

  if (depsError) {
    return NextResponse.json({ error: depsError.message }, { status: 500 });
  }

  const depData = deps as { puedeEliminar: boolean } | null;
  if (depData && depData.puedeEliminar === false) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene datos enlazados.", dependencias: deps },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .schema("inv")
    .from("T_Vehiculo")
    .update({ Estado: false })
    .eq("Id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
