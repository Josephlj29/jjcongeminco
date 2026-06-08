import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActualizarUbicacion, CrearUbicacion, Ubicacion } from "@congeminco/shared";

export function useUbicaciones() {
  return useQuery({
    queryKey: ["ubicaciones"],
    queryFn: async () => {
      const res = await fetch("/api/ubicaciones");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar ubicaciones`);
      return res.json() as Promise<Ubicacion[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearUbicacion) => {
      const res = await fetch("/api/ubicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Ubicacion>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ubicaciones"] });
      // Invalidar también el catálogo de ubicaciones (dropdown en movimientos)
      void qc.invalidateQueries({ queryKey: ["catalogo", "ubicaciones"] });
    },
  });
}

export function useActualizarUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActualizarUbicacion> }) => {
      const res = await fetch(`/api/ubicaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Ubicacion>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ubicaciones"] });
      void qc.invalidateQueries({ queryKey: ["catalogo", "ubicaciones"] });
    },
  });
}

export function useEliminarUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ubicaciones/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ubicaciones"] });
      void qc.invalidateQueries({ queryKey: ["catalogo", "ubicaciones"] });
    },
  });
}
