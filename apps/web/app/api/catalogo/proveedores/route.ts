/**
 * app/api/catalogo/proveedores/route.ts
 *
 * GET /api/catalogo/proveedores
 * Retorna proveedores activos del esquema inv.
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
    .from("T_Proveedor")
    .select("Id, Codigo, Nombre")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
