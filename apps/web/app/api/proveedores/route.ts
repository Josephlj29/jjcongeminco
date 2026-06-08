/**
 * app/api/proveedores/route.ts
 *
 * GET  /api/proveedores — lista de proveedores activos (inv.T_Proveedor)
 * POST /api/proveedores — crea proveedor (rol: productoEscritura = admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearProveedorSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Proveedor")
    .select("Id, Ruc, Nombre, Contacto, Telefono, Estado")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para crear proveedores.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearProveedorSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Proveedor")
    .insert({
      Ruc: parsed.data.Ruc ?? null,
      Nombre: parsed.data.Nombre,
      Contacto: parsed.data.Contacto ?? null,
      Telefono: parsed.data.Telefono ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
