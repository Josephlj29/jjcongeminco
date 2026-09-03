/**
 * app/api/requerimientos/[id]/detalle/[idDetalle]/catalogar/route.ts
 *
 * POST — registra en el catálogo el producto de una línea NO catalogada del
 * requerimiento y la vincula (todo atómico vía inv.FnCatalogarLineaRequerimiento:
 * FnGuardarProducto con SKU autogenerado + StockMinimo por flota si llega 0 +
 * foto de la solicitud como imagen principal + link de la línea).
 *
 * Rol: aprobadores (requerimientoAprobar) o productoEscritura — quien entrega
 * (gerencia/supervisión) no tiene alta general de productos; este camino está
 * escoped al flujo de entrega y la RPC revalida el rol adentro.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearProductoSchema, puede } from "@congeminco/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; idDetalle: string }> },
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "requerimientoAprobar") && !puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para registrar productos de un requerimiento.", 403);
  }

  const { id, idDetalle } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CrearProductoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();

  // Scope por el requerimiento padre: la línea debe pertenecerle.
  const { data: linea, error: lineaError } = await supabase
    .schema("inv")
    .from("T_RequerimientoDetalle")
    .select("Id")
    .eq("Id", idDetalle)
    .eq("IdRequerimiento", id)
    .eq("Estado", true)
    .maybeSingle();

  if (lineaError) {
    return NextResponse.json({ error: lineaError.message }, { status: 500 });
  }
  if (!linea) {
    return respuestaError("La línea no existe o no pertenece a este requerimiento.", 404);
  }

  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnCatalogarLineaRequerimiento", { PIdDetalle: idDetalle, PProducto: parsed.data });

  if (dbError) {
    return mapearErrorNegocio(dbError, {
      mensajeDuplicado: "El SKU ya está en uso por un producto activo.",
    });
  }

  return NextResponse.json({ IdProducto: data as string }, { status: 201 });
}
