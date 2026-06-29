import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrearEvidenciaMantenimiento,
  OrdenMantenimientoEvidencia,
} from "@congeminco/shared";

/** Lista la evidencia fotográfica de una orden de mantenimiento. */
export function useEvidenciasMantenimiento(idOrden: string | null) {
  return useQuery({
    queryKey: ["evidencias-mantenimiento", idOrden],
    enabled: !!idOrden,
    queryFn: async () => {
      const res = await fetch(`/api/mantenimiento/${idOrden}/evidencias`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar evidencia`);
      return res.json() as Promise<OrdenMantenimientoEvidencia[]>;
    },
  });
}

/** Registra la URL de una foto ya subida a Storage (tope: 10 por tipo → 409). */
export function useCrearEvidenciaMantenimiento(idOrden: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearEvidenciaMantenimiento) => {
      const res = await fetch(`/api/mantenimiento/${idOrden}/evidencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<OrdenMantenimientoEvidencia>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["evidencias-mantenimiento", idOrden] });
    },
  });
}

/** Elimina una foto de evidencia. */
export function useEliminarEvidenciaMantenimiento(idOrden: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idEvidencia: string) => {
      const res = await fetch(
        `/api/mantenimiento/${idOrden}/evidencias/${idEvidencia}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`Error ${res.status} al eliminar evidencia`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["evidencias-mantenimiento", idOrden] });
    },
  });
}
