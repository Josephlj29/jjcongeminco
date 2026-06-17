/**
 * app/api/reportes/recambios/route.ts
 *
 * GET /api/reportes/recambios — recambios por equipo/placa × producto, con el
 * intervalo (días) desde el recambio anterior y el flag "Acelerado" (prematuro).
 * Filtros: ?desde, ?hasta (FechaRequerimiento), ?soloAcelerados=true.
 *
 * Lee inv.V_Recambio_Producto. Solo lectura, cualquier usuario autenticado.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puedeVerModulo, MODULOS } from "@congeminco/shared";

interface FilaRecambio {
  Cantidad: unknown;
  DiasDesdeAnterior: unknown;
  PromedioDiasPar: unknown;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puedeVerModulo(usuario.modulos, MODULOS.REPORTES)) {
    return respuestaError("No tienes permiso para ver reportes.", 403);
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const soloAcelerados = searchParams.get("soloAcelerados") === "true";

  const supabase = await crearClienteServidor();
  let query = supabase.schema("inv").from("V_Recambio_Producto").select("*");

  if (desde) query = query.gte("FechaRequerimiento", desde);
  if (hasta) query = query.lte("FechaRequerimiento", hasta);
  if (soloAcelerados) query = query.eq("Acelerado", true);

  // Red anti-OOM: tope de seguridad para históricos grandes.
  const { data, error: dbError } = await query
    .order("FechaRequerimiento", { ascending: false })
    .limit(5000);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // NUMERIC puede llegar como string; normalizamos.
  const resultado = ((data as FilaRecambio[]) ?? []).map((r) => ({
    ...r,
    Cantidad: Number(r.Cantidad),
    DiasDesdeAnterior: r.DiasDesdeAnterior == null ? null : Number(r.DiasDesdeAnterior),
    PromedioDiasPar: r.PromedioDiasPar == null ? null : Number(r.PromedioDiasPar),
  }));

  return NextResponse.json(resultado);
}
