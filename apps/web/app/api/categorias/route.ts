/**
 * app/api/categorias/route.ts
 *
 * GET  /api/categorias — categorías/familias activas, con el nombre de la familia
 *                        padre resuelto (por Id). Para el maestro.
 * POST /api/categorias — crea una categoría (rol: catalogoAdmin = admin).
 *
 * GOTCHA: .schema("inv") obligatorio.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearCategoriaSchema, puede } from "@congeminco/shared";

interface FilaCategoria {
  Id: string;
  IdCategoriaPadre: string | null;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
}

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Categoria")
    .select("Id, IdCategoriaPadre, Codigo, Nombre, Descripcion")
    .eq("Estado", true)
    .order("Nombre");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const filas = (data as FilaCategoria[]) ?? [];
  const nombrePorId = new Map(filas.map((c) => [c.Id, c.Nombre]));
  const resultado = filas.map((c) => ({
    ...c,
    NombreCategoriaPadre: c.IdCategoriaPadre
      ? nombrePorId.get(c.IdCategoriaPadre) ?? null
      : null,
  }));

  return NextResponse.json(resultado);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para crear categorías.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearCategoriaSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Categoria")
    .insert({
      Codigo: parsed.data.Codigo,
      Nombre: parsed.data.Nombre,
      Descripcion: parsed.data.Descripcion ?? null,
      IdCategoriaPadre: parsed.data.IdCategoriaPadre ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
