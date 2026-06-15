/**
 * app/api/productos/[id]/precios/route.ts
 *
 * GET /api/productos/:id/precios
 * Histórico de precios del producto (inv.FnHistorialPreciosProducto) con el
 * remanente de stock por lote (FIFO). Cada fila trae TieneStock: si es false,
 * el precio se muestra pero no debe poder elegirse como override (su lote ya
 * se consumió). No cambia la valorización (promedio móvil).
 *
 * Rol: cualquier usuario autenticado (solo lectura).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

interface FilaPrecio {
  [key: string]: unknown;
}

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
    .rpc("FnHistorialPreciosProducto", { PIdProducto: id });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // NUMERIC puede llegar como string; normalizamos a número para el frontend.
  const resultado = ((data as FilaPrecio[]) ?? []).map((r) => ({
    ...r,
    Costo: Number(r.Costo),
    CostoPromedio: Number(r.CostoPromedio),
    CantidadComprada: Number(r.CantidadComprada),
    CantidadRemanente: Number(r.CantidadRemanente),
  }));

  return NextResponse.json(resultado);
}
