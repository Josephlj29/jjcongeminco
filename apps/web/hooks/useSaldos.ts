import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  FacetaCategoria,
  PaginaSaldos,
  ProductoStockConsolidado,
  SaldoPorUbicacion,
} from "@congeminco/shared";

async function fetchSaldos(bajoMinimo?: boolean): Promise<ProductoStockConsolidado[]> {
  const url = bajoMinimo ? "/api/saldos?bajoMinimo=true" : "/api/saldos";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar saldos`);
  return res.json();
}

/**
 * Catálogo COMPLETO de productos con su stock.
 *
 * Lo usan los combos de producto (requerimientos, movimientos, consumo de
 * repuestos), que filtran en memoria y necesitan la lista entera. La pantalla
 * de Saldos NO usa este hook: usa `useSaldosPaginados`, que pide 10 filas.
 */
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

export interface FiltrosSaldos {
  /** Texto libre: SKU, nombre o código de proveedor. Ya viene con debounce. */
  q: string;
  idCategoria: string | null;
  bajoMinimo: boolean;
  orden: "recientes" | "nombre";
  pagina: number;
  limit?: number;
}

/**
 * Una página de saldos, filtrada y ordenada EN EL SERVIDOR.
 *
 * `placeholderData: keepPreviousData` mantiene la página anterior visible
 * mientras llega la nueva: al pasar de página o al tipear, la grilla no
 * parpadea a vacío ni salta el scroll. `isFetching` distingue "cargando la
 * primera vez" de "refrescando con datos en pantalla".
 */
export function useSaldosPaginados(filtros: FiltrosSaldos) {
  const { q, idCategoria, bajoMinimo, orden, pagina, limit = 10 } = filtros;

  return useQuery({
    queryKey: ["saldos", "pagina", { q, idCategoria, bajoMinimo, orden, pagina, limit }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        pagina: String(pagina),
        limit: String(limit),
        orden,
      });
      if (q) params.set("q", q);
      if (idCategoria) params.set("idCategoria", idCategoria);
      if (bajoMinimo) params.set("bajoMinimo", "true");

      const res = await fetch(`/api/saldos?${params.toString()}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar saldos`);
      return res.json() as Promise<PaginaSaldos>;
    },
  });
}

/* Categorías que tienen productos, con su conteo. Para los chips de filtro. */
export function useFacetasCategoria() {
  return useQuery({
    queryKey: ["saldos", "facetas"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await fetch("/api/saldos?facetas=true");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar categorías`);
      return res.json() as Promise<FacetaCategoria[]>;
    },
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
