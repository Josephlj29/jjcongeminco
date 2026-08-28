/**
 * Guard de ruta: solo roles con el módulo Movimientos.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function MovimientosLayout({ children }: { children: React.ReactNode }) {
  await requerirModulo(MODULOS.MOVIMIENTOS);
  return <>{children}</>;
}
