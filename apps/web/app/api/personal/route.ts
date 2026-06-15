/**
 * app/api/personal/route.ts
 *
 * GET  /api/personal — personal activo con cargo y usuario de acceso resueltos.
 * POST /api/personal — crea personal (rol: catalogoAdmin = admin).
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CrearPersonalSchema, puede, type PersonalConDetalle } from "@congeminco/shared";

interface FilaPersonal {
  Id: string;
  NombreCompleto: string;
  Dni: string | null;
  Telefono: string | null;
  IdCargo: string;
  IdUsuario: string | null;
  T_Cargo: { Nombre: string } | null;
}

export async function GET() {
  const { error } = await autenticarRequest();
  if (error) return error;

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Personal")
    .select("Id, NombreCompleto, Dni, Telefono, IdCargo, IdUsuario, T_Cargo(Nombre)")
    .eq("Estado", true)
    .order("NombreCompleto");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const filas = (data as unknown as FilaPersonal[]) ?? [];

  // Nombres de usuario vinculado (esquema seg) — mapa por Id.
  const idsUsuario = filas.map((p) => p.IdUsuario).filter((x): x is string => !!x);
  const nombrePorUsuario = new Map<string, string>();
  if (idsUsuario.length) {
    const { data: usuarios } = await supabase
      .schema("seg")
      .from("T_Usuario")
      .select("Id, NombreCompleto")
      .in("Id", idsUsuario);
    (usuarios as { Id: string; NombreCompleto: string }[] | null)?.forEach((u) =>
      nombrePorUsuario.set(u.Id, u.NombreCompleto)
    );
  }

  const resultado: PersonalConDetalle[] = filas.map((p) => ({
    Id: p.Id,
    NombreCompleto: p.NombreCompleto,
    Dni: p.Dni,
    Telefono: p.Telefono,
    IdCargo: p.IdCargo,
    NombreCargo: p.T_Cargo?.Nombre ?? null,
    IdUsuario: p.IdUsuario,
    NombreUsuario: p.IdUsuario ? nombrePorUsuario.get(p.IdUsuario) ?? null : null,
  }));

  return NextResponse.json(resultado);
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para crear personal.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CrearPersonalSchema.safeParse(body);
  if (!parsed.success) {
    return respuestaError("Datos inválidos.", 400, parsed.error.flatten());
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("inv")
    .from("T_Personal")
    .insert({
      NombreCompleto: parsed.data.NombreCompleto,
      Dni: parsed.data.Dni ?? null,
      Telefono: parsed.data.Telefono ?? null,
      IdCargo: parsed.data.IdCargo,
      IdUsuario: parsed.data.IdUsuario ?? null,
    })
    .select()
    .single();

  if (dbError) {
    const dup = /UQ_T_Personal_IdUsuario|duplicate key/i.test(dbError.message);
    return NextResponse.json(
      { error: dup ? "Ese usuario ya está vinculado a otro personal." : dbError.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json(data, { status: 201 });
}
