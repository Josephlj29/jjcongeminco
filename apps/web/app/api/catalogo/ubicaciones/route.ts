/**
 * app/api/catalogo/ubicaciones/route.ts
 *
 * GET /api/catalogo/ubicaciones
 * Retorna ubicaciones activas del esquema inv.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Ubicacion")
    .select("Id, Codigo, Nombre, Tipo")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
