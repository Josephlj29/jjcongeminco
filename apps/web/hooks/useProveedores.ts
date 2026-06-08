import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActualizarProveedor, CrearProveedor, Proveedor } from "@congeminco/shared";

export function useProveedores() {
  return useQuery({
    queryKey: ["proveedores"],
    queryFn: async () => {
      const res = await fetch("/api/proveedores");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar proveedores`);
      return res.json() as Promise<Proveedor[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearProveedor) => {
      const res = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Proveedor>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["proveedores"] });
      // Invalidar también el catálogo de proveedores (dropdown en movimientos)
      void qc.invalidateQueries({ queryKey: ["catalogo", "proveedores"] });
    },
  });
}

export function useActualizarProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActualizarProveedor> }) => {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Proveedor>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["proveedores"] });
      void qc.invalidateQueries({ queryKey: ["catalogo", "proveedores"] });
    },
  });
}

export function useEliminarProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/proveedores/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["proveedores"] });
      void qc.invalidateQueries({ queryKey: ["catalogo", "proveedores"] });
    },
  });
}
