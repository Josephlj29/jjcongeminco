/**
 * app/api/mantenimiento/[id]/route.ts
 *
 * GET    /api/mantenimiento/:id — OT + trabajos + repuestos consumidos (del ledger).
 * PATCH  /api/mantenimiento/:id — edita cabecera + trabajos (solo abierta) vía RPC.
 * DELETE /api/mantenimiento/:id — soft-delete; bloquea si ya consumió repuestos.
 *
 * Rol para PATCH/DELETE: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  CrearOrdenMantenimientoSchema,
  puede,
  type OrdenMantenimientoConDetalle,
} from "@congeminco/shared";

interface FilaPersonal {
  Id: string;
  IdPersonal: string;
  Orden: number;
  T_Personal: { NombreCompleto: string; T_Cargo: { Nombre: string } | null } | null;
}

interface FilaHeader {
  Id: string;
  NumeroOrden: string | null;
  FechaOrden: string;
  TipoMantenimiento: "preventivo" | "correctivo";
  Turno: "dia" | "tarde" | "noche";
  Kilometraje: number | null;
  IdVehiculo: string;
  Observaciones: string | null;
  Situacion: OrdenMantenimientoConDetalle["Situacion"];
  IdRequerimiento: string | null;
  IdDocumentoInventarioReversa: string | null;
  MotivoReconciliacion: string | null;
  FechaReconciliacion: string | null;
  T_Vehiculo: { Placa: string } | null;
  T_OrdenMantenimientoPersonal: FilaPersonal[] | null;
}

interface FilaMovimiento {
  IdProducto: string;
  Cantidad: number;
  CostoUnitario: number | null;
  T_Producto: {
    Nombre: string;
    Sku: string;
    T_UnidadMedida: { Codigo: string } | null;
  } | null;
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
    .from("T_OrdenMantenimiento")
    .select(
      "Id, NumeroOrden, FechaOrden, TipoMantenimiento, Turno, Kilometraje, IdVehiculo, Observaciones, Situacion, IdRequerimiento, IdDocumentoInventarioReversa, MotivoReconciliacion, FechaReconciliacion, T_Vehiculo(Placa), T_OrdenMantenimientoPersonal(Id, IdPersonal, Orden, T_Personal(NombreCompleto, T_Cargo(Nombre)))"
    )
    .eq("Id", id)
    .eq("Estado", true)
    .maybeSingle();

  if (headerError) {
    return NextResponse.json({ error: headerError.message }, { status: 500 });
  }
  if (!header) return respuestaError("Orden no encontrada.", 404);
  const h = header as unknown as FilaHeader;

  const { data: trabajos, error: trabajosError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoTrabajo")
    .select("Id, Secuencia, Descripcion")
    .eq("IdOrdenMantenimiento", id)
    .eq("Estado", true)
    .order("Secuencia");

  if (trabajosError) {
    return NextResponse.json({ error: trabajosError.message }, { status: 500 });
  }

  // Repuestos = movimientos de egreso de la salida del requerimiento enlazado
  // (costo unitario congelado en el ledger).
  let repuestos: OrdenMantenimientoConDetalle["Repuestos"] = [];
  if (h.IdRequerimiento) {
    const { data: req } = await supabase
      .schema("inv")
      .from("T_Requerimiento")
      .select("IdDocumentoInventario")
      .eq("Id", h.IdRequerimiento)
      .maybeSingle();
    const salidaId = (req as { IdDocumentoInventario: string | null } | null)
      ?.IdDocumentoInventario;
    if (salidaId) {
      const { data: movs } = await supabase
        .schema("inv")
        .from("T_MovimientoStock")
        .select(
          "IdProducto, Cantidad, CostoUnitario, T_Producto(Nombre, Sku, T_UnidadMedida(Codigo))"
        )
        .eq("IdDocumentoInventario", salidaId)
        .eq("Direccion", -1);
      repuestos = ((movs as unknown as FilaMovimiento[]) ?? []).map((m) => ({
        IdProducto: m.IdProducto,
        NombreProducto: m.T_Producto?.Nombre ?? "—",
        Sku: m.T_Producto?.Sku ?? "—",
        CodigoUnidad: m.T_Producto?.T_UnidadMedida?.Codigo ?? null,
        Cantidad: Number(m.Cantidad),
        CostoUnitario: Number(m.CostoUnitario ?? 0),
      }));
    }
  }

  // Evidencia fotográfica (estado_actual / post_mantenimiento) ordenada por tipo+orden.
  const { data: evidencias, error: evidenciasError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoEvidencia")
    .select("Id, Tipo, Url, Orden")
    .eq("IdOrdenMantenimiento", id)
    .eq("Estado", true)
    .order("Tipo")
    .order("Orden");

  if (evidenciasError) {
    return NextResponse.json({ error: evidenciasError.message }, { status: 500 });
  }

  const personales = (h.T_OrdenMantenimientoPersonal ?? [])
    .slice()
    .sort((a, b) => a.Orden - b.Orden)
    .map((p) => ({
      Id: p.Id,
      IdPersonal: p.IdPersonal,
      NombreCompleto: p.T_Personal?.NombreCompleto ?? null,
      Cargo: p.T_Personal?.T_Cargo?.Nombre ?? null,
      Orden: Number(p.Orden),
    }));

  const resultado: OrdenMantenimientoConDetalle = {
    Id: h.Id,
    NumeroOrden: h.NumeroOrden,
    FechaOrden: h.FechaOrden,
    TipoMantenimiento: h.TipoMantenimiento,
    Turno: h.Turno,
    Kilometraje: h.Kilometraje === null ? null : Number(h.Kilometraje),
    IdVehiculo: h.IdVehiculo,
    Placa: h.T_Vehiculo?.Placa ?? null,
    Personales: personales,
    Situacion: h.Situacion,
    Observaciones: h.Observaciones,
    IdRequerimiento: h.IdRequerimiento,
    IdDocumentoInventarioReversa: h.IdDocumentoInventarioReversa,
    MotivoReconciliacion: h.MotivoReconciliacion,
    FechaReconciliacion: h.FechaReconciliacion,
    Trabajos: ((trabajos as { Id: string; Secuencia: number; Descripcion: string }[]) ?? []).map(
      (t) => ({ Id: t.Id, Secuencia: Number(t.Secuencia), Descripcion: t.Descripcion })
    ),
    Repuestos: repuestos,
    Evidencias: ((evidencias as OrdenMantenimientoConDetalle["Evidencias"]) ?? []).map((e) => ({
      Id: e.Id,
      Tipo: e.Tipo,
      Url: e.Url,
      Orden: Number(e.Orden),
    })),
  };

  return NextResponse.json(resultado);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para editar órdenes de mantenimiento.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CrearOrdenMantenimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase
    .schema("inv")
    .rpc("FnActualizarOrdenMantenimiento", { PIdOrden: id, POrden: parsed.data });

  if (dbError) {
    const reglaNegocio = /abierta|no existe|edita/i.test(dbError.message);
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para eliminar órdenes de mantenimiento.", 403);
  }

  const { id } = await params;
  const supabase = await crearClienteServidor();

  // Soft-delete atómico (FOR UPDATE + check de estado en una transacción): cierra
  // el TOCTOU del antiguo DELETE crudo. La RPC rechaza OTs ya consumidas.
  const { error: dbError } = await supabase
    .schema("inv")
    .rpc("FnEliminarOrdenMantenimiento", { PIdOrden: id });

  if (dbError) {
    const reglaNegocio = /no existe|ya consumio|permiso/i.test(dbError.message);
    return NextResponse.json(
      { error: dbError.message },
      { status: reglaNegocio ? 409 : 500 }
    );
  }
  return new NextResponse(null, { status: 204 });
}
