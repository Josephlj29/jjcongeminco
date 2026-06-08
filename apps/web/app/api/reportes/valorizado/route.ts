/**
 * app/api/reportes/valorizado/route.ts
 *
 * GET /api/reportes/valorizado — stock valorizado
 *
 * Query params: idCategoria (filtra por NombreCategoria), soloBajoMinimo=true
 * Fuente: inv.V_Producto_Valorizado
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const idCategoria = searchParams.get("idCategoria");
  const soloBajoMinimo = searchParams.get("soloBajoMinimo");

  const supabase = await crearClienteServidor();
  let query = supabase
    .schema("inv")
    .from("V_Producto_Valorizado")
    .select("*");

  if (idCategoria) query = query.eq("NombreCategoria", idCategoria);
  if (soloBajoMinimo === "true") query = query.eq("BajoMinimo", true);

  const { data, error: dbError } = await query.order("NombreProducto");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
