import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActualizarEquipo, ActualizarVehiculo, CrearEquipo, CrearVehiculo, Equipo, Vehiculo } from "@congeminco/shared";

export function useEquipos() {
  return useQuery({
    queryKey: ["equipos"],
    queryFn: async () => {
      const res = await fetch("/api/equipos");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar equipos`);
      return res.json() as Promise<Equipo[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useVehiculos() {
  return useQuery({
    queryKey: ["vehiculos"],
    queryFn: async () => {
      const res = await fetch("/api/vehiculos");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar vehículos`);
      return res.json() as Promise<Vehiculo[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearEquipo) => {
      const res = await fetch("/api/equipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Equipo>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipos"] });
    },
  });
}

export function useCrearVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearVehiculo) => {
      const res = await fetch("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Vehiculo>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vehiculos"] });
    },
  });
}

export function useActualizarEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActualizarEquipo> }) => {
      const res = await fetch(`/api/equipos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Equipo>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipos"] });
    },
  });
}

export function useActualizarVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActualizarVehiculo> }) => {
      const res = await fetch(`/api/vehiculos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<Vehiculo>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vehiculos"] });
    },
  });
}

export function useEliminarEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipos"] });
    },
  });
}

export function useEliminarVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/vehiculos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vehiculos"] });
    },
  });
}
