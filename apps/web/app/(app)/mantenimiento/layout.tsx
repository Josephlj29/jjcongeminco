/**
 * Guard de ruta: solo roles con el módulo Mantenimiento.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function MantenimientoLayout({ children }: { children: React.ReactNode }) {
  await requerirModulo(MODULOS.MANTENIMIENTO);
  return <>{children}</>;
}
