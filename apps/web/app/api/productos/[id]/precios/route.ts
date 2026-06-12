/**
 * app/api/productos/[id]/precios/route.ts
 *
 * GET /api/productos/:id/precios
 * Histórico de precios del producto desde inv.T_ProductoPrecioHistorico,
 * con embed del nombre del proveedor. Devuelve las últimas 50 filas
 * ordenadas por FechaPrecio desc.
 *
 * Respuesta: Array<{ ...columnas, NombreProveedor }>
 * Rol: cualquier usuario autenticado (solo lectura).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

interface ProveedorEmbed {
  Nombre: string;
}

interface FilaPrecio {
  T_Proveedor: ProveedorEmbed | null;
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
    .from("T_ProductoPrecioHistorico")
    .select("*, T_Proveedor(Nombre)")
    .eq("IdProducto", id)
    .order("FechaPrecio", { ascending: false })
    .limit(50);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Aplanar el embed: extraer NombreProveedor y quitar T_Proveedor del objeto
  const resultado = (data as FilaPrecio[]).map(({ T_Proveedor, ...resto }) => ({
    ...resto,
    NombreProveedor: T_Proveedor?.Nombre ?? null,
  }));

  return NextResponse.json(resultado);
}
