/**
 * app/api/vehiculos/route.ts
 *
 * GET  /api/vehiculos — lista de vehículos/placas activas (inv.T_Vehiculo)
 * POST /api/vehiculos — crea vehículo (rol: productoEscritura = admin, almacenero)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearVehiculoSchema, puede } from "@congeminco/shared";

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Vehiculo")
    .select("Id, Placa, Modelo, IdEquipo")
    .eq("Estado", true)
    .order("Placa");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tienes permiso para crear placas.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearVehiculoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Vehiculo")
    .insert({
      Placa: parsed.data.Placa,
      Modelo: parsed.data.Modelo ?? null,
      IdEquipo: parsed.data.IdEquipo ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
