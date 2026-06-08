import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrearImagenProducto, ProductoImagen } from "@congeminco/shared";

export function useImagenesProducto(idProducto: string | null) {
  return useQuery({
    queryKey: ["imagenes", idProducto],
    queryFn: async () => {
      const res = await fetch(`/api/productos/${idProducto}/imagenes`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar imágenes`);
      return res.json() as Promise<ProductoImagen[]>;
    },
    enabled: !!idProducto,
  });
}

export function useCrearImagenProducto(idProducto: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearImagenProducto) => {
      const res = await fetch(`/api/productos/${idProducto}/imagenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["imagenes", idProducto] });
    },
  });
}

export function useEliminarImagenProducto(idProducto: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idImagen: string) => {
      const res = await fetch(
        `/api/productos/${idProducto}/imagenes/${idImagen}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`Error ${res.status} al eliminar imagen`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["imagenes", idProducto] });
    },
  });
}
