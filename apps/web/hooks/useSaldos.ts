import { useQuery } from "@tanstack/react-query";
import type {
  ProductoStockConsolidado,
  SaldoPorUbicacion,
} from "@congeminco/shared";

async function fetchSaldos(bajoMinimo?: boolean): Promise<ProductoStockConsolidado[]> {
  const url = bajoMinimo ? "/api/saldos?bajoMinimo=true" : "/api/saldos";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar saldos`);
  return res.json();
}

export function useSaldos() {
  return useQuery({
    queryKey: ["saldos"],
    queryFn: () => fetchSaldos(),
  });
}

export function useSaldosBajoMinimo() {
  return useQuery({
    queryKey: ["saldos", "bajoMinimo"],
    queryFn: () => fetchSaldos(true),
  });
}

/* Stock por ubicación de un producto (lazy: solo cuando se abre el Sheet de detalle). */
export function useSaldosPorUbicacion(idProducto: string | null, habilitado = true) {
  return useQuery({
    queryKey: ["saldos", "porUbicacion", idProducto],
    enabled: habilitado && !!idProducto,
    queryFn: async () => {
      const res = await fetch(`/api/saldos?porUbicacion=true&idProducto=${idProducto}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar saldos por ubicación`);
      return res.json() as Promise<SaldoPorUbicacion[]>;
    },
  });
}
