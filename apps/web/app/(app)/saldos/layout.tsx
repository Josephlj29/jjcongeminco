/**
 * Guard de ruta: solo roles con el módulo Saldos.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function SaldosLayout({ children }: { children: React.ReactNode }) {
  await requerirModulo(MODULOS.SALDOS);
  return <>{children}</>;
}
