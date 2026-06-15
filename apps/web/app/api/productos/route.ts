/**
 * app/api/productos/route.ts
 *
 * GET  /api/productos  — lista desde inv.V_Producto_StockConsolidado
 *                        ?q=<texto> búsqueda por SKU o nombre
 *                        ?bajoMinimo=true filtra por BajoMinimo
 * POST /api/productos  — crea en inv.T_Producto (rol: admin, almacenero)
 *
 * GOTCHA: .schema("inv") OBLIGATORIO en todas las consultas.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearProductoSchema, puede } from "@congeminco/shared";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const bajoMinimo = searchParams.get("bajoMinimo");

  const supabase = await crearClienteServidor();
  let query = supabase
    .schema("inv")
    .from("V_Producto_StockConsolidado")
    .select("*");

  if (bajoMinimo === "true") {
    query = query.eq("BajoMinimo", true);
  }

  if (q && q.trim().length > 0) {
    const termino = `%${q.trim()}%`;
    query = query.or(`Sku.ilike.${termino},NombreProducto.ilike.${termino}`);
  }

  const { data, error: dbError } = await query.order("NombreProducto");
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para crear productos.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearProductoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  // FnGuardarProducto crea el producto y su compatibilidad (puente) en una
  // transacción, aplicando la invariante general XOR tipos.
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnGuardarProducto", { PProducto: parsed.data });

  if (dbError) {
    // Las violaciones de invariante son errores de validación (400), no de infra.
    const reglaNegocio = /general no lleva|al menos un tipo|no existe/i.test(
      dbError.message
    );
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 400 : 500 }
    );
  }

  return NextResponse.json({ Id: data as string }, { status: 201 });
}
