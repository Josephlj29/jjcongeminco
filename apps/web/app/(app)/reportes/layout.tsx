/**
 * Guard de ruta: solo roles con el módulo Reportes (admin, gerencia, supervisión).
 * Reportes expone costos y valorizado — no es para roles operativos.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function ReportesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirModulo(MODULOS.REPORTES);
  return <>{children}</>;
}