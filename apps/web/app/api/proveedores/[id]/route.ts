/**
 * app/api/proveedores/[id]/route.ts
 *
 * PATCH  /api/proveedores/:id — actualiza un proveedor (rol: admin, almacenero)
 * DELETE /api/proveedores/:id — soft-delete (Estado=false, rol: admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearProveedorSchema, puede } from "@congeminco/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para eliminar proveedores.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  // Guardia: verificar dependencias antes del soft-delete
  const { data: deps, error: depsError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: "proveedor", PId: id });

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
    .from("T_Proveedor")
    .update({ Estado: false })
    .eq("Id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
