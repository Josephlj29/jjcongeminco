/**
 * app/api/usuarios/route.ts
 *
 * GET /api/usuarios — usuarios de acceso (seg.T_Usuario) con su rol, para
 * vincular opcionalmente un personal a su login. Solo admin (catalogoAdmin).
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puede, type UsuarioAcceso } from "@congeminco/shared";

interface FilaUsuario {
  Id: string;
  NombreCompleto: string;
  T_Rol: { Codigo: string } | null;
}

export async function GET() {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puede(usuario.rol, "catalogoAdmin")) {
    return respuestaError("No tienes permiso para listar usuarios.", 403);
  }

  const supabase = await crearClienteServidor();
  const { data, error: dbError } = await supabase
    .schema("seg")
    .from("T_Usuario")
    .select("Id, NombreCompleto, T_Rol(Codigo)")
    .eq("Estado", true)
    .order("NombreCompleto");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const resultado: UsuarioAcceso[] = (data as unknown as FilaUsuario[]).map((u) => ({
    Id: u.Id,
    NombreCompleto: u.NombreCompleto,
    Rol: u.T_Rol?.Codigo ?? null,
  }));

  return NextResponse.json(resultado);
}
