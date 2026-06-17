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
import { puedeVerModulo, type ModuloCode } from "@congeminco/shared";

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