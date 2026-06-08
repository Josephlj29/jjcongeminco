import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrearProducto, ActualizarProducto } from "@congeminco/shared";

/* Tipo para la vista consolidada de stock */
export interface ProductoConsolidado {
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  NombreCategoria: string;
  CodigoUnidad: string;
  StockMinimo: number;
  StockTotal: number;
  BajoMinimo: boolean;
}

interface ProductosParams {
  q?: string;
  bajoMinimo?: boolean;
}

async function fetchProductos(params: ProductosParams): Promise<ProductoConsolidado[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.bajoMinimo) sp.set("bajoMinimo", "true");

  const qs = sp.toString();
  const res = await fetch(`/api/productos${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar productos`);
  return res.json();
}

export function useProductos(params: ProductosParams = {}) {
  return useQuery({
    queryKey: ["productos", params],
    queryFn: () => fetchProductos(params),
  });
}

export function useCrearProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearProducto) => {
      const res = await fetch("/api/productos", {
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
      void qc.invalidateQueries({ queryKey: ["productos"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
    },
  });
}

export function useActualizarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ActualizarProducto>;
    }) => {
      const res = await fetch(`/api/productos/${id}`, {
        method: "PATCH",
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
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
  });
}

export function useEliminarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/productos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409: el servidor detectó dependencias (race condition entre el check del modal y el submit)
        throw new Error(body.error ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["productos"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
      void qc.invalidateQueries({ queryKey: ["dependencias"] });
    },
  });
}
