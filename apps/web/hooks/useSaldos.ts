import { useQuery } from "@tanstack/react-query";
import type { ProductoStockConsolidado } from "@congeminco/shared";

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
