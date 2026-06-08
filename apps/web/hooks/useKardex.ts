import { useQuery } from "@tanstack/react-query";
import type { KardexFila } from "@congeminco/shared";

export function useKardex(idProducto: string | null) {
  return useQuery({
    queryKey: ["kardex", idProducto],
    queryFn: async () => {
      const res = await fetch(`/api/kardex/${idProducto}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar kardex`);
      return res.json() as Promise<KardexFila[]>;
    },
    enabled: !!idProducto,
  });
}
