/**
 * app/api/documentos/historial/route.ts
 *
 * GET /api/documentos/historial — historial paginado de documentos de inventario
 * → { items, total, pagina, limit, totalPaginas }
 *
 * Filtros server-side (ver lib/historial-documentos.ts): ?desde= ?hasta= (fecha
 * contable), ?tipo=, ?situacion=, ?q= (N°, comprobante, referencia, notas),
 * ?registradoPor=, ?idProducto=.
 *
 * Rol: documentoHistorial (solo admin). Es la puerta para corregir o anular
 * documentos viejos, así que no alcanza con tener el módulo Movimientos.
 *
 * PuedeCorregir/MotivoBloqueo se evalúan con la misma función que usa la
 * mutación, pero solo para las filas de la página: recorre lotes y saldos y
 * hacerlo para toda la tabla sería una consulta pesada por documento.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerFiltrosHistorial } from "@/lib/historial-documentos";
import { puede, type DocumentoHistorial } from "@congeminco/shared";

type FilaVista = Omit<DocumentoHistorial, "PuedeCorregir" | "MotivoBloqueo">;

export async function GET(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "documentoHistorial")) {
    return respuestaError("Solo un administrador puede ver el historial de documentos.", 403);
  }

  const filtros = leerFiltrosHistorial(new URL(request.url).searchParams);
  const { pagina, limit } = filtros;
  const vacia = { items: [], total: 0, pagina, limit, totalPaginas: 1 };
  const supabase = await crearClienteServidor();

  /* Filtro por producto: documentos que lo movieron, sacados del ledger. */
  let idsDocumento: string[] | null = null;
  if (filtros.idProducto) {
    const { data, error: dbError } = await supabase
      .schema("inv")
      .from("T_MovimientoStock")
      .select("IdDocumentoInventario")
      .eq("IdProducto", filtros.idProducto);
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    idsDocumento = [...new Set((data ?? []).map((m) => m.IdDocumentoInventario as string))];
    if (idsDocumento.length === 0) return NextResponse.json(vacia);
  }

  let query = supabase
    .schema("inv")
    .from("V_Historial_DocumentoInventario")
    .select("*", { count: "exact" });

  if (idsDocumento) query = query.in("Id", idsDocumento);
  if (filtros.desde) query = query.gte("FechaDocumento", filtros.desde);
  if (filtros.hasta) query = query.lte("FechaDocumento", filtros.hasta);
  if (filtros.tipo) query = query.eq("TipoDocumento", filtros.tipo);
  if (filtros.situacion) query = query.eq("Situacion", filtros.situacion);
  if (filtros.registradoPor) query = query.ilike("RegistradoPor", `%${filtros.registradoPor}%`);
  if (filtros.q) {
    const q = filtros.q;
    query = query.or(
      `NumeroDocumento.ilike.%${q}%,Comprobante.ilike.%${q}%,Referencia.ilike.%${q}%,Notas.ilike.%${q}%`,
    );
  }

  // Orden total hasta el Id: sin desempate único una fila puede repetirse en
  // dos páginas mientras otra no aparece (mismo criterio que /api/saldos).
  query = query
    .order("FechaDocumento", { ascending: false })
    .order("FechaCreacion", { ascending: false })
    .order("Id", { ascending: true });

  const desde = (pagina - 1) * limit;
  const { data, count, error: dbError } = await query.range(desde, desde + limit - 1);

  if (dbError) {
    // PGRST103 = página más allá del total (los datos se achicaron entre requests).
    if (dbError.code === "PGRST103") return NextResponse.json(vacia);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const filas = (data ?? []) as FilaVista[];
  const motivos = await Promise.all(
    filas.map((f) =>
      supabase
        .schema("inv")
        .rpc("FnMotivoBloqueoCorreccionDocumento", { PIdDocumento: f.Id })
        .then(({ data: motivo, error: errorMotivo }) => {
          if (errorMotivo) throw errorMotivo;
          return (motivo as string | null) ?? null;
        }),
    ),
  ).catch((e: { message?: string }) => e);

  if (!Array.isArray(motivos)) {
    return NextResponse.json({ error: motivos.message ?? "Error al evaluar documentos" }, { status: 500 });
  }

  const items: DocumentoHistorial[] = filas.map((f, i) => ({
    ...f,
    CantidadItems: Number(f.CantidadItems),
    ValorTotal: Number(f.ValorTotal),
    PuedeCorregir: motivos[i] === null,
    MotivoBloqueo: motivos[i],
  }));

  const total = count ?? 0;
  return NextResponse.json({
    items,
    total,
    pagina,
    limit,
    totalPaginas: Math.max(Math.ceil(total / limit), 1),
  });
}
