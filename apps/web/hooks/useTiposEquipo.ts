import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActualizarTipoEquipo,
  AsociacionProductoTipoEquipo,
  CrearTipoEquipo,
  TipoEquipo,
} from "@congeminco/shared";

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

export function useTiposEquipo() {
  return useQuery({
    queryKey: ["tipos-equipo"],
    queryFn: async () => {
      const res = await fetch("/api/tipos-equipo");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar tipos de equipo`);
      return res.json() as Promise<TipoEquipo[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearTipoEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearTipoEquipo) => {
      const res = await fetch("/api/tipos-equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<TipoEquipo>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tipos-equipo"] }),
  });
}

export function useActualizarTipoEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ActualizarTipoEquipo }) => {
      const res = await fetch(`/api/tipos-equipo/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<TipoEquipo>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tipos-equipo"] }),
  });
}

export function useEliminarTipoEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tipos-equipo/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await leerError(res));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tipos-equipo"] }),
  });
}

/* Toda la puente producto<->tipo (para chips en el listado de productos). */
export function useAsociacionesTiposEquipo() {
  return useQuery({
    queryKey: ["tipos-equipo", "asociaciones"],
    queryFn: async () => {
      const res = await fetch("/api/tipos-equipo/asociaciones");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar asociaciones`);
      return res.json() as Promise<AsociacionProductoTipoEquipo[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/* Tipos compatibles de un producto puntual. */
export function useTiposEquipoDeProducto(idProducto: string | null) {
  return useQuery({
    queryKey: ["productos", idProducto, "tipos-equipo"],
    enabled: !!idProducto,
    queryFn: async () => {
      const res = await fetch(`/api/productos/${idProducto}/tipos-equipo`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar tipos del producto`);
      return res.json() as Promise<AsociacionProductoTipoEquipo[]>;
    },
  });
}

/* Reemplaza el set de tipos compatibles de un producto. */
export function useAsignarTiposEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idProducto, idsTipoEquipo }: { idProducto: string; idsTipoEquipo: string[] }) => {
      const res = await fetch(`/api/productos/${idProducto}/tipos-equipo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IdsTipoEquipo: idsTipoEquipo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["tipos-equipo", "asociaciones"] });
      void qc.invalidateQueries({ queryKey: ["productos", vars.idProducto, "tipos-equipo"] });
    },
  });
}

/* Asociación masiva: todos los productos de una categoría a un tipo. */
export function useAsociarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idTipoEquipo, idCategoria }: { idTipoEquipo: string; idCategoria: string }) => {
      const res = await fetch(`/api/tipos-equipo/${idTipoEquipo}/asociar-categoria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IdCategoria: idCategoria }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ insertados: number }>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tipos-equipo", "asociaciones"] }),
  });
}
