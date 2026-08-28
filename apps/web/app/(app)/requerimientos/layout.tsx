/**
 * Guard de ruta: solo roles con el módulo Requerimientos.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function RequerimientosLayout({ children }: { children: React.ReactNode }) {
  await requerirModulo(MODULOS.REQUERIMIENTOS);
  return <>{children}</>;
}
