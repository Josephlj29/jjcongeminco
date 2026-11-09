/**
 * app/api/productos/[id]/baja/route.ts
 *
 * POST   /api/productos/:id/baja — da de baja un producto con historial
 *        (body: { IdProductoUnificado?, Motivo? }). Solo admin, saldo 0.
 * DELETE /api/productos/:id/baja — lo reactiva. Solo admin.
 *
 * Distinto de DELETE /api/productos/:id (eliminar): eliminar solo procede sin
 * datos enlazados; la baja conserva el producto por su kardex y lo oculta a
 * los demás roles. Las reglas las revalida la BD (FnDarDeBajaProducto, 0086).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, mapearErrorNegocio, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { DarDeBajaProductoSchema, puede } from "@congeminco/shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoBaja")) {
    return respuestaError("Solo un administrador puede dar de baja productos.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = DarDeBajaProductoSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase.schema("inv").rpc("FnDarDeBajaProducto", {
    PIdProducto: id,
    PIdProductoUnificado: parsed.data.IdProductoUnificado ?? null,
    PMotivo: parsed.data.Motivo || null,
  });

  if (dbError) return mapearErrorNegocio(dbError);
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoBaja")) {
    return respuestaError("Solo un administrador puede reactivar productos.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase
    .schema("inv")
    .rpc("FnReactivarProducto", { PIdProducto: id });

  if (dbError) return mapearErrorNegocio(dbError);
  return new NextResponse(null, { status: 204 });
}
