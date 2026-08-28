/**
 * app/api/proveedores/[id]/route.ts
 *
 * PATCH  /api/proveedores/:id — actualiza un proveedor (rol: admin, almacenero)
 * DELETE /api/proveedores/:id — soft-delete (Estado=false, rol: admin, almacenero)
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
import { CrearProveedorSchema, puede } from "@congeminco/shared";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para editar proveedores.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  // Edición = guardado completo (proveedor + cuentas) vía FnGuardarProveedor.
  const parsed = CrearProveedorSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: rpcError } = await supabase
    .schema("inv")
    .rpc("FnGuardarProveedor", { PProveedor: { ...parsed.data, Id: id } });

  if (rpcError) {
    return respuestaErrorBD(rpcError, "El RUC ya está en uso por un proveedor activo.");
  }

  const { data, error: selError } = await supabase
    .schema("inv")
    .from("V_Proveedor")
    .select("Id, Ruc, Nombre, Contacto, Telefono, Estado, Cuentas")
    .eq("Id", id)
    .single();

  if (selError) {
    return NextResponse.json({ error: selError.message }, { status: 500 });
  }
  if (!data) {
    return respuestaError("Proveedor no encontrado.", 404);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para eliminar proveedores.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: resultado, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnEliminarConDependencias", { PEntidad: "proveedor", PId: id });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }
  const res = resultado as { ok: boolean; dependencias?: unknown };
  if (!res?.ok) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene datos enlazados.", dependencias: res?.dependencias },
      { status: 409 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
