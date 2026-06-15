/**
 * app/api/mantenimiento/route.ts
 *
 * GET  /api/mantenimiento — lista de órdenes de trabajo (soporta ?situacion=).
 * POST /api/mantenimiento — crea una OT vía RPC inv.FnRegistrarOrdenMantenimiento.
 *
 * Rol requerido para POST: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  CrearOrdenMantenimientoSchema,
  puede,
  type OrdenMantenimientoResumen,
} from "@congeminco/shared";

interface FilaOrden {
  Id: string;
  NumeroOrden: string | null;
  FechaOrden: string;
  TipoMantenimiento: "preventivo" | "correctivo";
  Turno: "dia" | "tarde" | "noche";
  Kilometraje: number | null;
  IdVehiculo: string;
  IdMecanicoResponsable: string;
  Situacion: OrdenMantenimientoResumen["Situacion"];
  T_Vehiculo: { Placa: string } | null;
  T_Personal: { NombreCompleto: string } | null;
}

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const situacion = searchParams.get("situacion");
  const cantidad = parseInt(searchParams.get("limit") ?? "100", 10) || 100;

  const supabase = await crearClienteServidor();
  let query = supabase
    .schema("inv")
    .from("T_OrdenMantenimiento")
    .select(
      "Id, NumeroOrden, FechaOrden, TipoMantenimiento, Turno, Kilometraje, IdVehiculo, IdMecanicoResponsable, Situacion, T_Vehiculo(Placa), T_Personal(NombreCompleto)"
    )
    .eq("Estado", true);

  if (situacion) query = query.eq("Situacion", situacion);

  const { data, error: dbError } = await query
    .order("FechaOrden", { ascending: false })
    .limit(cantidad);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const filas = (data as unknown as FilaOrden[]) ?? [];
  const resultado: OrdenMantenimientoResumen[] = filas.map((o) => ({
    Id: o.Id,
    NumeroOrden: o.NumeroOrden,
    FechaOrden: o.FechaOrden,
    TipoMantenimiento: o.TipoMantenimiento,
    Turno: o.Turno,
    Kilometraje: o.Kilometraje === null ? null : Number(o.Kilometraje),
    IdVehiculo: o.IdVehiculo,
    Placa: o.T_Vehiculo?.Placa ?? null,
    IdMecanicoResponsable: o.IdMecanicoResponsable,
    NombreMecanico: o.T_Personal?.NombreCompleto ?? null,
    Situacion: o.Situacion,
  }));

  return NextResponse.json(resultado);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para crear órdenes de mantenimiento.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearOrdenMantenimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnRegistrarOrdenMantenimiento", { POrden: parsed.data });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ Id: data }, { status: 201 });
}
