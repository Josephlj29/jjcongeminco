import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrearCategoria, ActualizarCategoria } from "@congeminco/shared";

/* Fila del maestro de categorías: incluye el nombre de la familia padre (por Id). */
export interface CategoriaMaestro {
  Id: string;
  IdCategoriaPadre: string | null;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  NombreCategoriaPadre: string | null;
}

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

/* Invalida el maestro y el catálogo (el select de categorías en el form de productos). */
function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["categorias", "maestro"] });
  void qc.invalidateQueries({ queryKey: ["catalogo", "categorias"] });
}

export function useCategoriasMaestro() {
  return useQuery({
    queryKey: ["categorias", "maestro"],
    queryFn: async () => {
      const res = await fetch("/api/categorias");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar categorías`);
      return res.json() as Promise<CategoriaMaestro[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearCategoria) => {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<CategoriaMaestro>;
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useActualizarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ActualizarCategoria }) => {
      const res = await fetch(`/api/categorias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<CategoriaMaestro>;
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useEliminarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/categorias/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await leerError(res));
    },
    onSuccess: () => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ["dependencias"] });
    },
  });
}
