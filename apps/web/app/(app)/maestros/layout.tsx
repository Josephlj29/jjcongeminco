/**
 * Guard de ruta: el grupo Maestros (general) lo ven admin, gerencia y supervisión.
 * El almacenero queda fuera de TODO el grupo. La sub-ruta /maestros/proveedores
 * tiene además su propio guard más restrictivo (admin/gerencia).
 */
import { requerirModulo, MODULOS } from "@/lib/auth-guard";

export default async function MaestrosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirModulo(MODULOS.MAESTROS_GENERAL);
  return <>{children}</>;
}