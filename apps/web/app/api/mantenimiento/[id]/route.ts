/**
 * app/api/mantenimiento/[id]/route.ts
 *
 * GET    /api/mantenimiento/:id — OT + trabajos (con sus fotos por tarea) + repuestos:
 *        si la OT todavía no descontó stock, el BORRADOR (inv.V_OrdenMantenimientoRepuesto,
 *        costo estimado); si ya lo descontó, las líneas del ledger (todas las salidas del
 *        requerimiento enlazado). Incluye StockDescontado y la cabecera del borrador.
 * PATCH  /api/mantenimiento/:id — reemplaza cabecera + trabajos + borrador de repuestos
 *        (OT abierta o por aprobar sin stock descontado) vía RPC; devuelve { ok, Situacion }.
 * DELETE /api/mantenimiento/:id — soft-delete; bloquea si ya consumió repuestos.
 *
 * Rol para PATCH/DELETE: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ActualizarOrdenMantenimientoSchema,
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
  Horometro: number | null;
  IdVehiculo: string;
  Observaciones: string | null;
  Situacion: OrdenMantenimientoConDetalle["Situacion"];
  IdRequerimiento: string | null;
  IdDocumentoInventarioReversa: string | null;
  MotivoReconciliacion: string | null;
  FechaReconciliacion: string | null;
  IdUbicacionConsumo: string | null;
  IdProveedorCompra: string | null;
  ComprobanteCompra: string | null;
  T_Vehiculo: { Placa: string } | null;
  T_OrdenMantenimientoPersonal: FilaPersonal[] | null;
}

/* Fila de inv.V_OrdenMantenimientoRepuesto (borrador, antes de aprobar). */
interface FilaRepuestoBorrador {
  IdProducto: string;
  NombreProducto: string;
  Sku: string;
  CodigoUnidad: string | null;
  Cantidad: number;
  Modo: "stock" | "compra";
  CostoUnitarioCompra: number | null;
  CostoUnitario: number | null;
}

interface FilaTrabajo {
  Id: string;
  Secuencia: number;
  Descripcion: string;
  UrlFotoAntes: string | null;
  UrlFotoDespues: string | null;
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: header, error: headerError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimiento")
    .select(
      "Id, NumeroOrden, FechaOrden, TipoMantenimiento, Turno, Kilometraje, Horometro, IdVehiculo, Observaciones, Situacion, IdRequerimiento, IdDocumentoInventarioReversa, MotivoReconciliacion, FechaReconciliacion, IdUbicacionConsumo, IdProveedorCompra, ComprobanteCompra, T_Vehiculo(Placa), T_OrdenMantenimientoPersonal(Id, IdPersonal, Orden, T_Personal(NombreCompleto, T_Cargo(Nombre)))",
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
    .select("Id, Secuencia, Descripcion, UrlFotoAntes, UrlFotoDespues")
    .eq("IdOrdenMantenimiento", id)
    .eq("Estado", true)
    .order("Secuencia");

  if (trabajosError) {
    return NextResponse.json({ error: trabajosError.message }, { status: 500 });
  }

  // Repuestos. Sin requerimiento enlazado la OT todavía no descontó stock: se lee
  // el BORRADOR desde la vista (costo estimado). Con requerimiento, las líneas son
  // los egresos de TODAS las salidas (T_RequerimientoAtencion), agrupados por
  // producto con el costo promedio ponderado congelado en el ledger.
  let repuestos: OrdenMantenimientoConDetalle["Repuestos"] = [];
  if (!h.IdRequerimiento) {
    const { data: borrador, error: borradorError } = await supabase
      .schema("inv")
      .from("V_OrdenMantenimientoRepuesto")
      .select(
        "IdProducto, NombreProducto, Sku, CodigoUnidad, Cantidad, Modo, CostoUnitarioCompra, CostoUnitario",
      )
      .eq("IdOrdenMantenimiento", id)
      .order("FechaCreacion");
    if (borradorError) {
      return NextResponse.json({ error: borradorError.message }, { status: 500 });
    }
    repuestos = ((borrador as unknown as FilaRepuestoBorrador[]) ?? []).map((r) => ({
      IdProducto: r.IdProducto,
      NombreProducto: r.NombreProducto,
      Sku: r.Sku,
      CodigoUnidad: r.CodigoUnidad,
      Cantidad: Number(r.Cantidad),
      Modo: r.Modo,
      CostoUnitarioCompra: r.CostoUnitarioCompra === null ? null : Number(r.CostoUnitarioCompra),
      CostoUnitario: Number(r.CostoUnitario ?? 0),
    }));
  } else {
    const { data: atenciones } = await supabase
      .schema("inv")
      .from("T_RequerimientoAtencion")
      .select("IdDocumentoInventario")
      .eq("IdRequerimiento", h.IdRequerimiento)
      .eq("Estado", true);
    const salidaIds = ((atenciones as { IdDocumentoInventario: string }[] | null) ?? []).map(
      (a) => a.IdDocumentoInventario,
    );
    if (salidaIds.length) {
      const { data: movs } = await supabase
        .schema("inv")
        .from("T_MovimientoStock")
        .select(
          "IdProducto, Cantidad, CostoUnitario, T_Producto(Nombre, Sku, T_UnidadMedida(Codigo))",
        )
        .in("IdDocumentoInventario", salidaIds)
        .eq("Direccion", -1);
      const porProducto = new Map<string, OrdenMantenimientoConDetalle["Repuestos"][number]>();
      for (const m of (movs as unknown as FilaMovimiento[]) ?? []) {
        const cant = Number(m.Cantidad);
        const costo = Number(m.CostoUnitario ?? 0);
        const previo = porProducto.get(m.IdProducto);
        if (!previo) {
          porProducto.set(m.IdProducto, {
            IdProducto: m.IdProducto,
            NombreProducto: m.T_Producto?.Nombre ?? "—",
            Sku: m.T_Producto?.Sku ?? "—",
            CodigoUnidad: m.T_Producto?.T_UnidadMedida?.Codigo ?? null,
            Cantidad: cant,
            // El ledger no distingue el modo original; ya descontado, es informativo.
            Modo: "stock",
            CostoUnitarioCompra: null,
            CostoUnitario: costo,
          });
          continue;
        }
        const total = previo.Cantidad + cant;
        previo.CostoUnitario =
          total > 0 ? (previo.Cantidad * previo.CostoUnitario + cant * costo) / total : 0;
        previo.Cantidad = total;
      }
      repuestos = [...porProducto.values()];
    }
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
    Horometro: h.Horometro === null ? null : Number(h.Horometro),
    IdVehiculo: h.IdVehiculo,
    Placa: h.T_Vehiculo?.Placa ?? null,
    Personales: personales,
    Situacion: h.Situacion,
    Observaciones: h.Observaciones,
    IdRequerimiento: h.IdRequerimiento,
    IdDocumentoInventarioReversa: h.IdDocumentoInventarioReversa,
    MotivoReconciliacion: h.MotivoReconciliacion,
    FechaReconciliacion: h.FechaReconciliacion,
    StockDescontado: h.IdRequerimiento !== null,
    IdUbicacionConsumo: h.IdUbicacionConsumo ?? null,
    IdProveedorCompra: h.IdProveedorCompra ?? null,
    ComprobanteCompra: h.ComprobanteCompra ?? null,
    Trabajos: ((trabajos as FilaTrabajo[] | null) ?? []).map((t) => ({
      Id: t.Id,
      Secuencia: Number(t.Secuencia),
      Descripcion: t.Descripcion,
      UrlFotoAntes: t.UrlFotoAntes ?? null,
      UrlFotoDespues: t.UrlFotoDespues ?? null,
    })),
    Repuestos: repuestos,
  };

  return NextResponse.json(resultado);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para editar órdenes de mantenimiento.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ActualizarOrdenMantenimientoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { error: dbError } = await supabase
    .schema("inv")
    .rpc("FnActualizarOrdenMantenimiento", { PIdOrden: id, POrden: parsed.data });

  if (dbError) {
    return mapearErrorNegocio(dbError);
  }

  // La BD recalcula la situación según el borrador (con líneas queda por aprobar):
  // se lee para que la UI informe y salte a la pestaña correcta.
  const { data: actualizada } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimiento")
    .select("Situacion")
    .eq("Id", id)
    .maybeSingle();
  const situacion =
    (actualizada as { Situacion: OrdenMantenimientoConDetalle["Situacion"] } | null)
      ?.Situacion ?? null;

  return NextResponse.json({ ok: true, Situacion: situacion });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    return mapearErrorNegocio(dbError);
  }
  return new NextResponse(null, { status: 204 });
}
