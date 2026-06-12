/**
 * app/api/productos/[id]/tipos-equipo/route.ts
 *
 * GET /api/productos/:id/tipos-equipo
 *   Lista las filas de inv.T_ProductoTipoEquipo para el producto dado,
 *   con embed del nombre y código del tipo.
 *   Respuesta: Array<{ Id, IdProducto, IdTipoEquipo, NombreTipoEquipo, CodigoTipoEquipo }>
 *
 * PUT /api/productos/:id/tipos-equipo
 *   Body: { IdsTipoEquipo: number[] }
 *   Replace-set: borra las asociaciones que ya no están en IdsTipoEquipo
 *   e inserta las nuevas que faltan.
 *   Rol: productoEscritura (admin, almacenero).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AsignarTiposEquipoProductoSchema, puede } from "@congeminco/shared";

interface TipoEquipoEmbed {
  Nombre: string;
  Codigo: string;
}

interface FilaPuente {
  Id: string;
  IdProducto: string;
  IdTipoEquipo: string;
  T_TipoEquipo: TipoEquipoEmbed | null;
}

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
    .from("T_ProductoTipoEquipo")
    .select("Id, IdProducto, IdTipoEquipo, T_TipoEquipo(Nombre, Codigo)")
    .eq("IdProducto", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const resultado = (data as unknown as FilaPuente[]).map((fila) => ({
    Id: fila.Id,
    IdProducto: fila.IdProducto,
    IdTipoEquipo: fila.IdTipoEquipo,
    NombreTipoEquipo: fila.T_TipoEquipo?.Nombre ?? null,
    CodigoTipoEquipo: fila.T_TipoEquipo?.Codigo ?? null,
  }));

  return NextResponse.json(resultado);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "productoEscritura")) {
    return respuestaError("No tenés permiso para asignar tipos de equipo.", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AsignarTiposEquipoProductoSchema.safeParse(body);

  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const nuevosIds = parsed.data.IdsTipoEquipo;
  const supabase = await crearClienteServidor();

  // Leer asociaciones actuales del producto
  const { data: actuales, error: errorActuales } = await supabase
    .schema("inv")
    .from("T_ProductoTipoEquipo")
    .select("Id, IdTipoEquipo")
    .eq("IdProducto", id);

  if (errorActuales) {
    return NextResponse.json({ error: errorActuales.message }, { status: 500 });
  }

  const actualesTyped = (actuales ?? []) as { Id: string; IdTipoEquipo: string }[];
  const idsActuales = actualesTyped.map((f) => f.IdTipoEquipo);

  // Borrar las que ya no están en el nuevo set
  const idsABorrar = actualesTyped
    .filter((f) => !nuevosIds.includes(f.IdTipoEquipo))
    .map((f) => f.Id);

  if (idsABorrar.length > 0) {
    const { error: errorDelete } = await supabase
      .schema("inv")
      .from("T_ProductoTipoEquipo")
      .delete()
      .in("Id", idsABorrar);

    if (errorDelete) {
      return NextResponse.json({ error: errorDelete.message }, { status: 500 });
    }
  }

  // Insertar las nuevas que faltan
  const idsAInsertar = nuevosIds.filter((nId) => !idsActuales.includes(nId));

  if (idsAInsertar.length > 0) {
    const { error: errorInsert } = await supabase
      .schema("inv")
      .from("T_ProductoTipoEquipo")
      .insert(idsAInsertar.map((IdTipoEquipo) => ({ IdProducto: id, IdTipoEquipo })));

    if (errorInsert) {
      return NextResponse.json({ error: errorInsert.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
