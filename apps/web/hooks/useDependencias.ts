/**
 * hooks/useDependencias.ts
 *
 * Hook para consultar los conteos de dependencias de una entidad antes de eliminar.
 * Pega a GET /api/dependencias/:entidad/:id
 *
 * Solo hace fetch cuando `habilitado` es true y `id` está definido.
 * Esto permite activarlo únicamente cuando el modal de eliminación está abierto.
 */
import { useQuery } from "@tanstack/react-query";

/** Shape del JSONB que devuelve inv.FnContarDependencias */
export interface DependenciasResult {
  total: number;
  puedeEliminar: boolean;
  // Campos variables según la entidad — todos son números
  movimientos?: number;
  detalleDocumentos?: number;
  detalleRequerimientos?: number;
  stockDisponible?: number;
  documentos?: number;
  precios?: number;
  vehiculos?: number;
  requerimientos?: number;
  [k: string]: number | boolean | undefined;
}

async function fetchDependencias(
  entidad: string,
  id: string
): Promise<DependenciasResult> {
  const res = await fetch(`/api/dependencias/${entidad}/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Error ${res.status} al verificar dependencias`);
  }
  return res.json() as Promise<DependenciasResult>;
}

export function useDependencias(
  entidad: string,
  id: string | null | undefined,
  habilitado: boolean
) {
  return useQuery({
    queryKey: ["dependencias", entidad, id],
    queryFn: () => fetchDependencias(entidad, id!),
    enabled: habilitado && !!id,
    // No queremos stale data en el modal: re-fetch siempre que se abra
    staleTime: 0,
  });
}
