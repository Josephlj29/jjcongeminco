import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AtenderRequerimiento,
  CrearRequerimiento,
  RequerimientoConDetalle,
} from "@congeminco/shared";

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

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

/* Detalle de un requerimiento (lazy: solo cuando se abre la bandeja). */
export function useRequerimientoDetalle(id: string | null) {
  return useQuery({
    queryKey: ["requerimientos", "detalle", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/requerimientos/${id}`);
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<RequerimientoConDetalle>;
    },
  });
}

/* Aprobar: genera la salida valorizada. Invalida saldos/movimientos/dashboard. */
export function useAtenderRequerimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: AtenderRequerimiento;
    }) => {
      const res = await fetch(`/api/requerimientos/${id}/atender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ IdDocumentoInventario: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requerimientos"] });
      // "saldos" cubre la página de saldos y los KPIs del dashboard;
      // "reportes" cubre los gráficos de dashboard y reportes.
      void qc.invalidateQueries({ queryKey: ["saldos"] });
      void qc.invalidateQueries({ queryKey: ["reportes"] });
    },
  });
}

/* Rechazar un requerimiento pendiente. */
export function useAnularRequerimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const res = await fetch(`/api/requerimientos/${id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Motivo: motivo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requerimientos"] });
    },
  });
}
