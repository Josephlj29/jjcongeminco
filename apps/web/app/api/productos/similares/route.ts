/**
 * app/api/productos/similares/route.ts
 *
 * GET /api/productos/similares?nombre=...&codigo=...&excluir=<uuid>
 * Productos activos que podrían ser el que se está por crear: mismo código de
 * proveedor (Motivo "codigo") o nombre parecido sin importar tildes ni orden
 * (Motivo "nombre"). Lo usa el alta de producto para preguntar
 * "¿No es alguno de estos?" antes de guardar (inv.FnProductosSimilares, 0085).
 */
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequest, mapearErrorNegocio } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const nombre = (searchParams.get("nombre") ?? "").trim();
  const codigo = (searchParams.get("codigo") ?? "").trim();
  const excluir = searchParams.get("excluir");

  if (!nombre && !codigo) return NextResponse.json([]);

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase.schema("inv").rpc("FnProductosSimilares", {
    PNombre: nombre,
    PCodigoProveedor: codigo || null,
    PIdExcluir: excluir && UUID.test(excluir) ? excluir : null,
  });

  if (dbError) return mapearErrorNegocio(dbError);

  return NextResponse.json(
    (data ?? []).map((p: { Similitud: number | string }) => ({
      ...p,
      Similitud: Number(p.Similitud),
    })),
  );
}
