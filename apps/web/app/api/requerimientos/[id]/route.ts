/**
 * app/api/requerimientos/[id]/route.ts
 *
 * GET /api/requerimientos/:id — requerimiento + detalle (para la bandeja de
 * aprobación). Incluye nombres de equipo/placa y datos del producto por línea.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { RequerimientoConDetalle } from "@congeminco/shared";

interface FilaHeader {
  Id: string;
  NumeroRequerimiento: string | null;
  FechaRequerimiento: string;
  Origen: RequerimientoConDetalle["Origen"];
  Situacion: RequerimientoConDetalle["Situacion"];
  IdEquipo: string | null;
  IdVehiculo: string | null;
  Notas: string | null;
  IdDocumentoInventario: string | null;
  T_Equipo: { Codigo: string; Nombre: string } | null;
  T_Vehiculo: { Placa: string } | null;
}

interface FilaDetalle {
  Id: string;
  IdProducto: string;
  Cantidad: number;
  CantidadAtendida: number;
  Notas: string | null;
  T_Producto: { Nombre: string; Sku: string; CostoPromedio: number } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: header, error: headerError } = await supabase
    .schema("inv")
    .from("T_Requerimiento")
    .select(
      "Id, NumeroRequerimiento, FechaRequerimiento, Origen, Situacion, IdEquipo, IdVehiculo, Notas, IdDocumentoInventario, T_Equipo(Codigo, Nombre), T_Vehiculo(Placa)"
    )
    .eq("Id", id)
    .eq("Estado", true)
    .maybeSingle();

  if (headerError) {
    return NextResponse.json({ error: headerError.message }, { status: 500 });
  }
  if (!header) {
    return respuestaError("Requerimiento no encontrado.", 404);
  }

  const { data: detalle, error: detalleError } = await supabase
    .schema("inv")
    .from("T_RequerimientoDetalle")
    .select(
      "Id, IdProducto, Cantidad, CantidadAtendida, Notas, T_Producto(Nombre, Sku, CostoPromedio)"
    )
    .eq("IdRequerimiento", id)
    .eq("Estado", true);

  if (detalleError) {
    return NextResponse.json({ error: detalleError.message }, { status: 500 });
  }

  const h = header as unknown as FilaHeader;
  const lineas = (detalle as unknown as FilaDetalle[]) ?? [];

  const resultado: RequerimientoConDetalle = {
    Id: h.Id,
    NumeroRequerimiento: h.NumeroRequerimiento,
    FechaRequerimiento: h.FechaRequerimiento,
    Origen: h.Origen,
    Situacion: h.Situacion,
    IdEquipo: h.IdEquipo,
    NombreEquipo: h.T_Equipo ? `${h.T_Equipo.Codigo} — ${h.T_Equipo.Nombre}` : null,
    IdVehiculo: h.IdVehiculo,
    Placa: h.T_Vehiculo?.Placa ?? null,
    Notas: h.Notas,
    IdDocumentoInventario: h.IdDocumentoInventario,
    Detalle: lineas.map((l) => ({
      Id: l.Id,
      IdProducto: l.IdProducto,
      NombreProducto: l.T_Producto?.Nombre ?? "—",
      Sku: l.T_Producto?.Sku ?? "—",
      Cantidad: Number(l.Cantidad),
      CantidadAtendida: Number(l.CantidadAtendida),
      CostoPromedio: Number(l.T_Producto?.CostoPromedio ?? 0),
      Notas: l.Notas,
    })),
  };

  return NextResponse.json(resultado);
}
