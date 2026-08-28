/**
 * Guard de ruta: solo roles con el módulo Catálogo.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function ProductosLayout({ children }: { children: React.ReactNode }) {
  await requerirModulo(MODULOS.CATALOGO);
  return <>{children}</>;
}
