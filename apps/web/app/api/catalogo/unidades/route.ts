/**
 * app/api/catalogo/unidades/route.ts
 *
 * GET /api/catalogo/unidades
 * Retorna unidades de medida activas del esquema inv.
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
    .from("T_UnidadMedida")
    .select("Id, Codigo, Nombre")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
