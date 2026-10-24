/**
 * lib/auth-guard.ts — Guard de ruta server-side por módulo.
 *
 * Complementa la RLS (que protege el dato a nivel base de datos): bloquea el
 * acceso por URL directa a secciones que el rol no debe ver. Se usa desde los
 * layouts anidados de cada sección restringida.
 *
 * Redirige a /login si no hay sesión y al dashboard si el rol no tiene el módulo.
 */
import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/supabase/server";
import { puede, puedeVerModulo, type ModuloCode, type PERMISOS } from "@congeminco/shared";

export { MODULOS } from "@congeminco/shared";

export async function requerirModulo(modulo: ModuloCode) {
  let usuario;
  try {
    usuario = await obtenerUsuario();
  } catch {
    redirect("/login");
  }
  if (!puedeVerModulo(usuario.modulos, modulo)) {
    redirect("/");
  }
  return usuario;
}

/**
 * Además del módulo, exige un permiso por ROL (PERMISOS de @congeminco/shared).
 * Para secciones que el RBAC por módulo no alcanza a distinguir: el historial
 * de documentos cuelga de Movimientos pero es solo de admin.
 */
export async function requerirPermiso(modulo: ModuloCode, permiso: keyof typeof PERMISOS) {
  const usuario = await requerirModulo(modulo);
  if (!puede(usuario.rol, permiso)) {
    redirect("/");
  }
  return usuario;
}
