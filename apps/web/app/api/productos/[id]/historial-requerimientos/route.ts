/**
 * app/api/productos/[id]/historial-requerimientos/route.ts
 *
 * GET /api/productos/:id/historial-requerimientos
 * Retorna el historial de requerimientos de un producto desde
 * inv.V_Producto_HistorialRequerimiento.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

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
    .from("V_Producto_HistorialRequerimiento")
    .select("*")
    .eq("IdProducto", id)
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Si no hay historial, devolver valores por defecto
  return NextResponse.json(
    data ?? {
      IdProducto: id,
      VecesPedido: 0,
      CantidadTotalPedida: 0,
      UltimaFechaPedido: null,
      VecesDesgastePrematuro: 0,
    }
  );
}
