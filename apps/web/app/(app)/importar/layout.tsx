/**
 * Guard de ruta: solo roles con el módulo Importar (admin).
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function ImportarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirModulo(MODULOS.IMPORTAR);
  return <>{children}</>;
}