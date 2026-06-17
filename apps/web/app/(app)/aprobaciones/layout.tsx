/**
 * Guard de ruta: solo roles con el módulo Aprobaciones (admin, gerencia, supervisión).
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function AprobacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirModulo(MODULOS.APROBACIONES);
  return <>{children}</>;
}