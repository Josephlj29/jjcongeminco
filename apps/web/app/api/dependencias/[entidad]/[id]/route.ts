/**
 * app/api/dependencias/[entidad]/[id]/route.ts
 *
 * GET /api/dependencias/:entidad/:id
 * Devuelve el conteo de datos enlazados para la entidad dada.
 * Llama a inv.FnContarDependencias y retorna el JSONB tal cual.
 *
 * Respuestas:
 *   200 — { total, puedeEliminar, ...conteos }
 *   400 — entidad inválida
 *   401 — sin sesión
 *   500 — error de base de datos
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

const ENTIDADES_VALIDAS = [
  "producto",
  "proveedor",
  "ubicacion",
  "equipo",
  "vehiculo",
] as const;

type EntidadValida = (typeof ENTIDADES_VALIDAS)[number];

function esEntidadValida(v: string): v is EntidadValida {
  return (ENTIDADES_VALIDAS as readonly string[]).includes(v);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entidad: string; id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  void usuario; // autenticado, no necesitamos el rol aquí

  const { entidad, id } = await params;

  if (!esEntidadValida(entidad)) {
    return respuestaError(
      `Entidad inválida. Válidas: ${ENTIDADES_VALIDAS.join(", ")}.`,
      400
    );
  }

  const supabase = await crearClienteServidor();

  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnContarDependencias", { PEntidad: entidad, PId: id });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
