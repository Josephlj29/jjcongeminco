/**
 * app/api/mantenimiento/[id]/evidencias/route.ts
 *
 * GET  /api/mantenimiento/:id/evidencias — lista la evidencia de la orden
 * POST /api/mantenimiento/:id/evidencias — registra URL de una foto ya subida a
 *                                          Storage (tope: MAX_EVIDENCIA_MANTENIMIENTO
 *                                          = 10 POR TIPO).
 *
 * El frontend sube la foto directamente a Supabase Storage y luego llama a este
 * endpoint para registrar la URL en inv.T_OrdenMantenimientoEvidencia. El mínimo
 * (1 de cada tipo para culminar) lo exige la BD al cerrar/reconciliar.
 *
 * Rol requerido para POST: requerimientoCrear (admin, almacenero, supervision).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  CrearEvidenciaMantenimientoSchema,
  MAX_EVIDENCIA_MANTENIMIENTO,
  puede,
} from "@congeminco/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoEvidencia")
    .select("Id, Tipo, Url, Orden")
    .eq("IdOrdenMantenimiento", id)
    .eq("Estado", true)
    .order("Tipo")
    .order("Orden");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "requerimientoCrear")) {
    return respuestaError("No tienes permiso para gestionar evidencia de mantenimiento.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = CrearEvidenciaMantenimientoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();

  // Tope de 10 POR TIPO (estado_actual / post_mantenimiento).
  const { count, error: errorCount } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoEvidencia")
    .select("Id", { count: "exact", head: true })
    .eq("IdOrdenMantenimiento", id)
    .eq("Tipo", parsed.data.Tipo)
    .eq("Estado", true);

  if (errorCount) {
    return NextResponse.json({ error: errorCount.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_EVIDENCIA_MANTENIMIENTO) {
    return respuestaError(
      `Cada tipo admite como máximo ${MAX_EVIDENCIA_MANTENIMIENTO} fotos.`,
      409
    );
  }

  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_OrdenMantenimientoEvidencia")
    .insert({
      IdOrdenMantenimiento: id,
      Tipo: parsed.data.Tipo,
      Url: parsed.data.Url,
      Orden: parsed.data.Orden,
    })
    .select("Id, Tipo, Url, Orden")
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
