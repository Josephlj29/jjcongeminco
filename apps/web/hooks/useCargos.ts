import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cargo, CrearCargo, ActualizarCargo } from "@congeminco/shared";

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

export function useCargos() {
  return useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const res = await fetch("/api/cargos");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar cargos`);
      return res.json() as Promise<Cargo[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearCargo) => {
      const res = await fetch("/api/cargos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<Cargo>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cargos"] }),
  });
}

export function useActualizarCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ActualizarCargo }) => {
      const res = await fetch(`/api/cargos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<Cargo>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cargos"] }),
  });
}

export function useEliminarCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cargos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await leerError(res));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cargos"] });
      void qc.invalidateQueries({ queryKey: ["dependencias"] });
    },
  });
}
