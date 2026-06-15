import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrearProducto,
  ActualizarProducto,
  ProductoConDetalle,
} from "@congeminco/shared";

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
  IdCategoria: string;
  EsGeneral: boolean;
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

/* Producto completo + sus tipos de equipo (para prellenar el form de edición). */
export function useProductoDetalle(id: string | null) {
  return useQuery({
    queryKey: ["productos", "detalle", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/productos/${id}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el producto`);
      return res.json() as Promise<ProductoConDetalle>;
    },
  });
}

/* Invalida productos, saldos y las asociaciones (chips de tipos en la grilla). */
function invalidarProducto(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["productos"] });
  void qc.invalidateQueries({ queryKey: ["saldos"] });
  void qc.invalidateQueries({ queryKey: ["tipos-equipo", "asociaciones"] });
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
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: () => invalidarProducto(qc),
  });
}

/* Edición completa del producto + su compatibilidad (PUT → FnGuardarProducto). */
export function useEditarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CrearProducto }) => {
      const res = await fetch(`/api/productos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: (_d, vars) => {
      invalidarProducto(qc);
      void qc.invalidateQueries({ queryKey: ["productos", "detalle", vars.id] });
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
