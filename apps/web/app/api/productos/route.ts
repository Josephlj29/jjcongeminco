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
    return respuestaError("No tenés permiso para crear productos.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearProductoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Producto")
    .insert({
      Sku: parsed.data.Sku,
      Nombre: parsed.data.Nombre,
      IdCategoria: parsed.data.IdCategoria,
      IdUnidadMedida: parsed.data.IdUnidadMedida,
      StockMinimo: parsed.data.StockMinimo,
      CodigoBarra: parsed.data.CodigoBarra ?? null,
      Atributos: parsed.data.Atributos,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
