/**
 * app/api/productos/[id]/route.ts
 *
 * GET    /api/productos/:id — producto completo + tipos de equipo (para el form)
 * PUT    /api/productos/:id — guarda producto + compatibilidad (FnGuardarProducto)
 * PATCH  /api/productos/:id — actualización parcial directa (rol: admin, almacenero)
 * DELETE /api/productos/:id — soft-delete (Estado=false, rol: admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ActualizarProductoSchema,
  CrearProductoSchema,
  puede,
  type ProductoConDetalle,
} from "@congeminco/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: producto, error: pError } = await supabase
    .schema("inv")
    .from("T_Producto")
    .select("*")
    .eq("Id", id)
    .maybeSingle();

  if (pError) {
    return NextResponse.json({ error: pError.message }, { status: 500 });
  }
  if (!producto) {
    return respuestaError("Producto no encontrado.", 404);
  }

  const { data: tipos, error: tError } = await supabase
    .schema("inv")
    .from("T_ProductoTipoEquipo")
    .select("IdTipoEquipo")
    .eq("IdProducto", id);

  if (tError) {
    return NextResponse.json({ error: tError.message }, { status: 500 });
  }

  const resultado: ProductoConDetalle = {
    ...(producto as Omit<ProductoConDetalle, "IdsTipoEquipo">),
    IdsTipoEquipo: (tipos ?? []).map((t) => t.IdTipoEquipo as string),
  };

  return NextResponse.json(resultado);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para editar productos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CrearProductoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnGuardarProducto", { PProducto: { ...parsed.data, Id: id } });

  if (dbError) {
    const reglaNegocio = /general no lleva|al menos un tipo|no existe/i.test(
      dbError.message
    );
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 400 : 500 }
    );
  }

  return NextResponse.json({ Id: data as string });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para editar productos.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarProductoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  if (Object.keys(parsed.data).length === 0) {
    return respuestaError("No se enviaron campos para actualizar.", 400);
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Producto")
    .update(parsed.data)
    .eq("Id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (!data) {
    return respuestaError("Producto no encontrado.", 404);
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
    return respuestaError("No tienes permiso para eliminar productos.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  // Guardia: verificar dependencias antes del soft-delete
  const { data: deps, error: depsError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: "producto", PId: id });

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
    .from("T_Producto")
    .update({ Estado: false })
    .eq("Id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
