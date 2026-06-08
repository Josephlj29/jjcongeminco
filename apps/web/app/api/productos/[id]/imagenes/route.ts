/**
 * app/api/productos/[id]/imagenes/route.ts
 *
 * GET  /api/productos/:id/imagenes — lista imágenes del producto
 * POST /api/productos/:id/imagenes — registra URL de imagen ya subida a Storage
 *                                    (tope: MAX_IMAGENES_PRODUCTO = 3)
 *
 * El frontend sube la imagen directamente a Supabase Storage y luego
 * llama a este endpoint para registrar la URL en inv.T_ProductoImagen.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearImagenProductoSchema, MAX_IMAGENES_PRODUCTO, puede } from "@congeminco/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_ProductoImagen")
    .select("Id, IdProducto, Url, Orden, EsPrincipal")
    .eq("IdProducto", id)
    .eq("Estado", true)
    .order("Orden");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para gestionar imágenes.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CrearImagenProductoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();

  // Verificar tope de imágenes por producto
  const { count, error: errorCount } = await supabase
    .schema("inv")
    .from("T_ProductoImagen")
    .select("Id", { count: "exact", head: true })
    .eq("IdProducto", id)
    .eq("Estado", true);

  if (errorCount) {
    return NextResponse.json({ error: errorCount.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_IMAGENES_PRODUCTO) {
    return respuestaError(
      `Un producto admite como máximo ${MAX_IMAGENES_PRODUCTO} imágenes.`,
      409
    );
  }

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_ProductoImagen")
    .insert({
      IdProducto: id,
      Url: parsed.data.Url,
      Orden: parsed.data.Orden,
      EsPrincipal: parsed.data.EsPrincipal,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
