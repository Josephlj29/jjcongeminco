/**
 * app/api/productos/[id]/imagenes/[idImagen]/route.ts
 *
 * DELETE /api/productos/:id/imagenes/:idImagen — elimina una imagen del producto
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puede } from "@congeminco/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; idImagen: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para gestionar imágenes.", 403);
  }

  const { idImagen } = await params;
  const supabase = await crearClienteServidor();

  const { error: dbError } = await supabase
    .schema("inv")
    .from("T_ProductoImagen")
    .delete()
    .eq("Id", idImagen);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
