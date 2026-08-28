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
      error: NextResponse.json({ error: "Token inválido o sesión expirada." }, { status: 401 }),
    };
  }
}

/** Helper para retornar errores de validación Zod de forma uniforme. */
export function respuestaError(mensaje: string, status = 400, detalles?: unknown) {
  return NextResponse.json({ error: mensaje, detalles }, { status });
}

/* Stems de mensajes de negocio (fallback si un error llega sin `code`; p. ej.
   algún driver que no propaga el SQLSTATE). El mapeo primario es por código. */
const STEMS_NEGOCIO =
  /stock insuficiente|pendiente|no existe|no entregar|solicitado|proveedor|comprobante|costo|creaste|almac[eé]n|evidencia|dependenci|no pertenece|situaci[oó]n|reconcili|consumi|cerrad|anulad/i;

/**
 * Mapea un error de Postgres/plpgsql a una respuesta HTTP por SQLSTATE:
 *  - P0001 (RAISE EXCEPTION de plpgsql) y 23514 (CHECK, p. ej. guard de stock) -> 409 (regla de negocio)
 *  - 23505 (unique_violation) -> 409 (usa `mensajeDuplicado` si se pasa)
 *  - 42501 (insufficient_privilege / RLS) -> 403
 *  - resto -> 500 con el mensaje crudo
 * El código es la fuente primaria; los stems de mensaje solo actúan de red si no hay `code`.
 */
export function mapearErrorNegocio(
  error: { code?: string; message: string },
  opciones?: { mensajeDuplicado?: string },
): NextResponse {
  const code = error.code;
  if (code === "23505") {
    return NextResponse.json(
      { error: opciones?.mensajeDuplicado ?? error.message },
      { status: 409 },
    );
  }
  if (code === "P0001" || code === "23514") {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (code === "42501") {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (!code && STEMS_NEGOCIO.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

/**
 * Alias retrocompatible: unique_violation (23505) -> 409 con `mensajeDuplicado`;
 * el resto delega en mapearErrorNegocio.
 */
export function respuestaErrorBD(
  error: { code?: string; message: string },
  mensajeDuplicado: string,
) {
  return mapearErrorNegocio(error, { mensajeDuplicado });
}
