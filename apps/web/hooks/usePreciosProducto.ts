import { useQuery } from "@tanstack/react-query";
import type { PrecioHistoricoConProveedor } from "@congeminco/shared";

/* Historial de precios de un producto (lazy: solo cuando se abre el dialog). */
export function usePreciosProducto(idProducto: string | null, habilitado = true) {
  return useQuery({
    queryKey: ["productos", idProducto, "precios"],
    enabled: habilitado && !!idProducto,
    queryFn: async () => {
      const res = await fetch(`/api/productos/${idProducto}/precios`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el historial de precios`);
      return res.json() as Promise<PrecioHistoricoConProveedor[]>;
    },
  });
}
