/**
 * Guard de ruta: Proveedores incluye datos bancarios sensibles → solo admin/gerencia.
 * Anida bajo el guard de /maestros (que ya excluye al almacenero); este excluye
 * además a supervisión.
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function ProveedoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirModulo(MODULOS.MAESTROS_PROVEEDORES);
  return <>{children}</>;
}