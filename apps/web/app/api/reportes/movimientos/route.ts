/**
 * app/api/reportes/movimientos/route.ts
 *
 * GET /api/reportes/movimientos — movimientos con filtros avanzados
 *
 * Query params: desde, hasta, idProducto, idCategoria, idProveedor,
 *               idUbicacion, idVehiculo, idEquipo, tipoDocumento
 *
 * Fuente: inv.V_Reporte_Movimiento (límite 1000 filas por request).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puedeVerModulo, MODULOS } from "@congeminco/shared";

export async function GET(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puedeVerModulo(usuario.modulos, MODULOS.REPORTES)) {
    return respuestaError("No tienes permiso para ver reportes.", 403);
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const idProducto = searchParams.get("idProducto");
  const idCategoria = searchParams.get("idCategoria");
  const idProveedor = searchParams.get("idProveedor");
  const idUbicacion = searchParams.get("idUbicacion");
  const idVehiculo = searchParams.get("idVehiculo");
  const idEquipo = searchParams.get("idEquipo");
  const tipoDocumento = searchParams.get("tipoDocumento");

  const supabase = await crearClienteServidor();
  let query = supabase
    .schema("inv")
    .from("V_Reporte_Movimiento")
    .select("*");

  if (desde) query = query.gte("FechaMovimiento", desde);
  if (hasta) query = query.lte("FechaMovimiento", hasta);
  if (idProducto) query = query.eq("IdProducto", idProducto);
  if (idCategoria) query = query.eq("IdCategoria", idCategoria);
  if (idProveedor) query = query.eq("IdProveedor", idProveedor);
  if (idUbicacion) query = query.eq("IdUbicacion", idUbicacion);
  if (idVehiculo) query = query.eq("IdVehiculo", idVehiculo);
  if (idEquipo) query = query.eq("IdEquipo", idEquipo);
  if (tipoDocumento) query = query.eq("TipoDocumento", tipoDocumento);

  const { data, error: dbError } = await query
    .order("FechaMovimiento", { ascending: false })
    .limit(1000);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
