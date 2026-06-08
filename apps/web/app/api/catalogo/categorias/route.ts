/**
 * app/api/catalogo/categorias/route.ts
 *
 * GET /api/catalogo/categorias
 * Retorna categorías activas del esquema inv.
 *
 * GOTCHA: .schema("inv") es OBLIGATORIO — la tabla no está en "public".
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
    .from("T_Categoria")
    .select("Id, IdCategoriaPadre, Codigo, Nombre")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
