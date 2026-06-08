import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrearRequerimiento } from "@congeminco/shared";

export interface RequerimientoResumen {
  Id: string;
  NumeroRequerimiento: string | null;
  FechaRequerimiento: string;
  Origen: string;
  IdEquipo: string | null;
  IdVehiculo: string | null;
  Situacion: "pendiente" | "atendido" | "anulado";
}

export function useRequerimientos(limit?: number) {
  const qs = limit ? `?limit=${limit}` : "";
  return useQuery({
    queryKey: ["requerimientos", limit],
    queryFn: async () => {
      const res = await fetch(`/api/requerimientos${qs}`);
      if (!res.ok)
        throw new Error(`Error ${res.status} al cargar requerimientos`);
      return res.json() as Promise<RequerimientoResumen[]>;
    },
  });
}

export function useCrearRequerimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearRequerimiento) => {
      const res = await fetch("/api/requerimientos", {
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requerimientos"] });
    },
  });
}
