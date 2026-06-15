import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PersonalConDetalle,
  CrearPersonal,
  ActualizarPersonal,
  UsuarioAcceso,
} from "@congeminco/shared";

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

export function usePersonal() {
  return useQuery({
    queryKey: ["personal"],
    queryFn: async () => {
      const res = await fetch("/api/personal");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar personal`);
      return res.json() as Promise<PersonalConDetalle[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/* Usuarios de acceso para vincular (solo admin lo puede consultar). */
export function useUsuariosAcceso(habilitado = true) {
  return useQuery({
    queryKey: ["usuarios"],
    enabled: habilitado,
    queryFn: async () => {
      const res = await fetch("/api/usuarios");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar usuarios`);
      return res.json() as Promise<UsuarioAcceso[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearPersonal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearPersonal) => {
      const res = await fetch("/api/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<PersonalConDetalle>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["personal"] }),
  });
}

export function useActualizarPersonal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ActualizarPersonal }) => {
      const res = await fetch(`/api/personal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<PersonalConDetalle>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["personal"] }),
  });
}

export function useEliminarPersonal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/personal/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await leerError(res));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["personal"] });
      void qc.invalidateQueries({ queryKey: ["dependencias"] });
    },
  });
}
