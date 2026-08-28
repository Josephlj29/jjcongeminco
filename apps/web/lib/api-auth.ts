/**
 * lib/api-auth.ts
 *
 * Helper compartido para autenticar requests en Route Handlers.
 * Valida la sesión del usuario y carga su rol desde seg.T_Usuario.
 *
 * Retorna { usuario } o lanza una NextResponse 401/403.
 */
import { NextResponse } from "next/server";
import { obtenerUsuario } from "@/lib/supabase/server";
import type { RoleCode } from "@congeminco/shared";

export interface UsuarioRequest {
  id: string;
  email: string | null;
  nombreCompleto: string | null;
  rol: RoleCode;
  modulos: string[];
}

/**
 * Valida la sesión y retorna el usuario autenticado.
 * Si la sesión es inválida retorna un NextResponse 401.
 */
export async function autenticarRequest(): Promise<
  { usuario: UsuarioRequest; error: null } | { usuario: null; error: NextResponse }
> {
  try {
    const usuario = await obtenerUsuario();
    return { usuario, error: null };
  } catch (e) {
    return {
      usuario: null,
      error: NextResponse.json(
        { error: "Token inválido o sesión expirada." },
        { status: 401 }
      ),
    };
  }
}

/** Helper para retornar errores de validación Zod de forma uniforme. */
export function respuestaError(mensaje: string, status = 400, detalles?: unknown) {
  return NextResponse.json({ error: mensaje, detalles }, { status });
}

/**
 * Mapea un error de Postgres a una respuesta HTTP.
 * unique_violation (23505) -> 409 con mensaje amigable (p. ej. código duplicado
 * entre registros activos); cualquier otro código -> 500 con el mensaje crudo.
 */
export function respuestaErrorBD(error: { code?: string; message: string }, mensajeDuplicado: string) {
  if (error.code === "23505") {
    return respuestaError(mensajeDuplicado, 409);
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}
