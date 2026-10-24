/**
 * Guard de ruta: historial de documentos, solo admin (documentoHistorial).
 * Cuelga del módulo Movimientos, pero ese módulo lo ven otros roles.
 */
import { requerirPermiso, MODULOS } from "@/lib/auth-guard";

export default async function HistorialLayout({ children }: { children: React.ReactNode }) {
  await requerirPermiso(MODULOS.MOVIMIENTOS, "documentoHistorial");
  return <>{children}</>;
}
