/**
 * app/api/lineas-equipo/route.ts
 *
 * GET  /api/lineas-equipo — líneas de flota activas (inv.T_LineaEquipo)
 * POST /api/lineas-equipo — crea una línea (rol: catalogoAdmin = admin)
 *
 * La línea es el primer nivel de la flota: trackless, liviana, y las que la
 * empresa vaya sumando. Antes era un prefijo dentro del código del tipo
 * ("LIN AMA - MINI"), así que agregar una línea nueva obligaba a renombrar
 * tipos a mano. Ahora es un maestro propio.
 *
 * Escritura solo admin, igual que el maestro de categorías: una línea nueva
 * reordena cómo se lee toda la flota. Es la misma decisión que toma
 * FnEliminarConDependencias('lineaEquipo'), que permite solo admin.
 *
 * GOTCHA: .schema("inv") obligatorio — la tabla no está en "public".
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, respuestaErrorBD } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearLineaEquipoSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_LineaEquipo")
    .select("Id, Codigo, Nombre, Descripcion, Orden")
    .eq("Estado", true)
    /* Orden primero: es el orden que la empresa le da a su flota, no el
       alfabético. Nombre como desempate estable. */
    .order("Orden")
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para crear líneas de equipo.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearLineaEquipoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_LineaEquipo")
    .insert({
      Codigo: parsed.data.Codigo,
      Nombre: parsed.data.Nombre,
      Descripcion: parsed.data.Descripcion ?? null,
      Orden: parsed.data.Orden ?? 0,
    })
    .select()
    .single();

  if (dbError) {
    return respuestaErrorBD(dbError, "El código ya está en uso por una línea activa.");
  }

  return NextResponse.json(data, { status: 201 });
}
