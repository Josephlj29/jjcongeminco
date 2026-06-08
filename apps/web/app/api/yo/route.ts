/**
 * app/api/yo/route.ts
 *
 * GET /api/yo — devuelve el usuario autenticado y su rol.
 * Permite al frontend resolver el rol sin exponer el esquema "seg" a PostgREST.
 *
 * NOTA: export const runtime = "nodejs" porque @supabase/ssr usa APIs de Node
 * (cookies, crypto) que no están disponibles en el runtime Edge de Cloudflare.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";

export async function GET() {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  return NextResponse.json({
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    nombreCompleto: usuario.nombreCompleto,
  });
}
