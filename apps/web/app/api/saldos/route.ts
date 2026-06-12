/**
 * app/api/saldos/route.ts
 *
 * GET /api/saldos — stock consolidado o por ubicación.
 *
 * Sin ?porUbicacion → inv.V_Producto_StockConsolidado
 *   Soporta ?bajoMinimo=true para filtrar por BajoMinimo.
 *
 * Con ?porUbicacion=true → inv.V_SaldoStock_PorUbicacion
 *   Soporta ?idProducto=<id> para filtrar por producto.
 *
 * Pensado para el dashboard, KPIs y vistas de detalle por ubicación.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const porUbicacion = searchParams.get("porUbicacion");

  const supabase = await crearClienteServidor();

  if (porUbicacion === "true") {
    const idProducto = searchParams.get("idProducto");

    let query = supabase
      .schema("inv")
      .from("V_SaldoStock_PorUbicacion")
      .select("*");

    if (idProducto) {
      query = query.eq("IdProducto", idProducto);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // Comportamiento original: vista consolidada
  const bajoMinimo = searchParams.get("bajoMinimo");

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
