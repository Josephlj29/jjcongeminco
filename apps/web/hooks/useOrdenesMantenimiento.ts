import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
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

/* Alta en un paso: trabajos con fotos + borrador de repuestos (Consumo). Toda OT
   nueva nace 'consumida' (por aprobar). El stock no se toca hasta aprobar, así
   que solo se invalidan las órdenes. */
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
      return res.json() as Promise<{ Id: string; Situacion: SituacionOrden | null }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}

/* Edición (OT abierta o por aprobar sin stock descontado): reemplaza cabecera,
   trabajos y borrador de repuestos; la BD recalcula la situación. */
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
      return res.json() as Promise<{ ok: true; Situacion: SituacionOrden | null }>;
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

/* Reconciliar (admin): aprobar = descontar el stock del borrador y cerrar;
   rechazar = anular (en OTs legadas que ya descontaron, además reversa). */
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
    mutationFn: async ({
      id,
      anular,
      motivo,
    }: {
      id: string;
      anular: boolean;
      motivo?: string;
    }) => {
      const res = await fetch(`/api/mantenimiento/${id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Anular: anular, Motivo: motivo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      // La BD decide el destino al culminar (por aprobar si hay repuestos,
      // cerrada si no); lo devolvemos para que la UI lo diga y cambie de pestaña.
      return res.json() as Promise<{ ok: true; Situacion: SituacionOrden | null }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}

/* Devolver a abierta (aprobador): saca la OT de la bandeja de aprobación y la
   vuelve editable, conservando el borrador de repuestos. Sin impacto en stock. */
export function useReabrirOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const res = await fetch(`/api/mantenimiento/${id}/reabrir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Motivo: motivo }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
    },
  });
}
