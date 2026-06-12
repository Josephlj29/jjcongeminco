/**
 * app/api/tipos-equipo/asociaciones/route.ts
 *
 * GET /api/tipos-equipo/asociaciones
 * Devuelve toda la tabla puente inv.T_ProductoTipoEquipo con embed del nombre
 * y código del tipo de equipo. Pensado para pintar chips en el listado de
 * productos con una sola query (sin N+1).
 *
 * Respuesta: Array<{ Id, IdProducto, IdTipoEquipo, NombreTipoEquipo, CodigoTipoEquipo }>
 *
 * NOTA: ruta estática — debe estar en /asociaciones/route.ts (no en [id])
 * para que Next.js no la confunda con el segmento dinámico.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

interface TipoEquipoEmbed {
  Nombre: string;
  Codigo: string;
}

interface FilaPuente {
  Id: string;
  IdProducto: string;
  IdTipoEquipo: string;
  T_TipoEquipo: TipoEquipoEmbed | null;
}

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_ProductoTipoEquipo")
    .select("Id, IdProducto, IdTipoEquipo, T_TipoEquipo(Nombre, Codigo)");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Aplanar el embed: T_TipoEquipo puede ser objeto o null
  const resultado = (data as unknown as FilaPuente[]).map((fila) => ({
    Id: fila.Id,
    IdProducto: fila.IdProducto,
    IdTipoEquipo: fila.IdTipoEquipo,
    NombreTipoEquipo: fila.T_TipoEquipo?.Nombre ?? null,
    CodigoTipoEquipo: fila.T_TipoEquipo?.Codigo ?? null,
  }));

  return NextResponse.json(resultado);
}
