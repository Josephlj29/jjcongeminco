/**
 * app/api/saldos/route.ts
 *
 * GET /api/saldos — stock consolidado desde inv.V_Producto_StockConsolidado
 * Soporta ?bajoMinimo=true para filtrar por BajoMinimo.
 *
 * NOTA: se usa la misma vista que /api/productos pero este endpoint
 * devuelve TODOS los campos de stock sin filtros de búsqueda por texto,
 * pensado para el dashboard y KPIs.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const bajoMinimo = searchParams.get("bajoMinimo");

  const supabase = await crearClienteServidor();
  let query = supabase
    .schema("inv")
    .from("V_Producto_StockConsolidado")
    .select("*");

  if (bajoMinimo === "true") {
    query = query.eq("BajoMinimo", true);
  }

  const { data, error: dbError } = await query.order("NombreProducto");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
