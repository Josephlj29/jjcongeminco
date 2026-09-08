/**
 * app/api/documentos/[id]/route.ts
 *
 * GET   /api/documentos/:id — cabecera + detalle + si se puede corregir y por qué no.
 * PATCH /api/documentos/:id — corrige un documento confirmado: la BD lo anula
 *                             (emitiendo su documento inverso) y registra el
 *                             corregido en la misma transacción. Devuelve el Id
 *                             del NUEVO documento.
 *
 * El ledger es append-only, así que no existe un UPDATE de movimientos: corregir
 * es anular y rehacer. La regla de "nada consumido" la decide la BD con la fila
 * bloqueada (FnMotivoBloqueoCorreccionDocumento); acá solo se valida el permiso.
 *
 * Rol: documentoCorregir (solo admin).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CorregirDocumentoSchema, puede } from "@congeminco/shared";

const COLUMNAS_CABECERA =
  "Id, TipoDocumento, FechaDocumento, NumeroDocumento, Comprobante, Referencia, Notas, Situacion, Estado, FechaCreacion, UsuarioCreacion, IdUbicacionOrigen, IdUbicacionDestino, IdProveedor, IdVehiculo";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: cabecera, error: errorCabecera } = await supabase
    .schema("inv")
    .from("T_DocumentoInventario")
    .select(COLUMNAS_CABECERA)
    .eq("Id", id)
    .maybeSingle();

  if (errorCabecera) return NextResponse.json({ error: errorCabecera.message }, { status: 500 });
  if (!cabecera) return respuestaError("El documento no existe.", 404);

  const { data: detalle, error: errorDetalle } = await supabase
    .schema("inv")
    .from("T_DocumentoInventarioDetalle")
    .select("IdProducto, Cantidad, CostoUnitario, IdVehiculo, Notas")
    .eq("IdDocumentoInventario", id)
    .eq("Estado", true)
    .order("FechaCreacion");

  if (errorDetalle) return NextResponse.json({ error: errorDetalle.message }, { status: 500 });

  // Respuesta firme sobre si se puede corregir: misma función que usa la mutación.
  const { data: motivo, error: errorMotivo } = await supabase
    .schema("inv")
    .rpc("FnMotivoBloqueoCorreccionDocumento", { PIdDocumento: id });

  if (errorMotivo) return NextResponse.json({ error: errorMotivo.message }, { status: 500 });

  const motivoBloqueo = (motivo as string | null) ?? null;
  return NextResponse.json({
    ...cabecera,
    Detalle: detalle ?? [],
    PuedeCorregir: motivoBloqueo === null,
    MotivoBloqueo: motivoBloqueo,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoCorregir")) {
    return respuestaError("Solo un administrador puede corregir un documento registrado.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CorregirDocumentoSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .rpc("FnCorregirDocumentoInventario", {
      PIdDocumento: id,
      PDocumento: parsed.data.Documento,
      PMotivo: parsed.data.Motivo,
    });

  if (dbError) {
    // "Ya se consumio...", "Atiende un requerimiento..." y demás reglas → 409.
    return mapearErrorNegocio(dbError);
  }

  return NextResponse.json({ Id: data as string });
}
