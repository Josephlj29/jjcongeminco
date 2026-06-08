/**
 * app/api/kardex/[idProducto]/route.ts
 *
 * GET /api/kardex/:idProducto — kardex desde inv.V_MovimientoStock_Kardex
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ idProducto: string }> }
) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { idProducto } = await params;
  const supabase = await crearClienteServidor();

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("V_MovimientoStock_Kardex")
    .select("*")
    .eq("IdProducto", idProducto)
    .order("FechaMovimiento", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
