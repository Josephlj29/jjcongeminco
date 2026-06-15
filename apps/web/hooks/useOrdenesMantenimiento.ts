import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumirRepuestos,
  CrearOrdenMantenimiento,
  OrdenMantenimientoConDetalle,
  OrdenMantenimientoResumen,
  SituacionOrden,
} from "@congeminco/shared";

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

export function useOrdenesMantenimiento(opts: { situacion?: SituacionOrden } = {}) {
  const qs = opts.situacion ? `?situacion=${opts.situacion}` : "";
  return useQuery({
    queryKey: ["ordenes-mantenimiento", opts.situacion ?? null],
    queryFn: async () => {
      const res = await fetch(`/api/mantenimiento${qs}`);
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<OrdenMantenimientoResumen[]>;
    },
  });
}

export function useOrdenMantenimientoDetalle(id: string | null) {
  return useQuery({
    queryKey: ["ordenes-mantenimiento", "detalle", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/mantenimiento/${id}`);
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<OrdenMantenimientoConDetalle>;
    },
  });
}

export function useCrearOrdenMantenimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearOrdenMantenimiento) => {
      const res = await fetch("/api/mantenimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}

export function useActualizarOrdenMantenimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CrearOrdenMantenimiento }) => {
      const res = await fetch(`/api/mantenimiento/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}

export function useEliminarOrdenMantenimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/mantenimiento/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await leerError(res));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}

/* Consumir repuestos: descuenta stock al instante. Invalida saldos/reportes. */
export function useConsumirRepuestos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ConsumirRepuestos }) => {
      const res = await fetch(`/api/mantenimiento/${id}/consumir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ IdDocumentoInventario: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
      void qc.invalidateQueries({ queryKey: ["reportes"] });
      void qc.invalidateQueries({ queryKey: ["requerimientos"] });
    },
  });
}

/* Reconciliar (admin): aprobar (cerrar) o rechazar (anular + reversa). */
export function useReconciliarOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      aprobar,
      motivo,
    }: {
      id: string;
      aprobar: boolean;
      motivo?: string;
    }) => {
      const res = await fetch(`/api/mantenimiento/${id}/reconciliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Aprobar: aprobar, Motivo: motivo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
      void qc.invalidateQueries({ queryKey: ["reportes"] });
      void qc.invalidateQueries({ queryKey: ["requerimientos"] });
    },
  });
}

/* Finalizar una OT abierta sin repuestos (cerrar o cancelar). */
export function useFinalizarOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, anular, motivo }: { id: string; anular: boolean; motivo?: string }) => {
      const res = await fetch(`/api/mantenimiento/${id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Anular: anular, Motivo: motivo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}
