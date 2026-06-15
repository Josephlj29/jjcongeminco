/**
 * app/api/proveedores/route.ts
 *
 * GET  /api/proveedores — proveedores activos con sus cuentas (inv.V_Proveedor)
 * POST /api/proveedores — crea proveedor + cuentas vía inv.FnGuardarProveedor
 *                         (rol: productoEscritura = admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearProveedorSchema, puede } from "@congeminco/shared";

const COLUMNAS = "Id, Ruc, Nombre, Contacto, Telefono, Estado, Cuentas";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("V_Proveedor")
    .select(COLUMNAS)
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
    return respuestaError("No tienes permiso para crear proveedores.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearProveedorSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  // FnGuardarProveedor crea el proveedor y reemplaza sus cuentas en una transacción.
  const { data: nuevoId, error: rpcError } = await supabase
    .schema("inv")
    .rpc("FnGuardarProveedor", { PProveedor: parsed.data });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const { data, error: selError } = await supabase
    .schema("inv")
    .from("V_Proveedor")
    .select(COLUMNAS)
    .eq("Id", nuevoId as string)
    .single();

  if (selError) {
    return NextResponse.json({ error: selError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
