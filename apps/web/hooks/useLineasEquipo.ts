/**
 * hooks/useLineasEquipo.ts — maestro de líneas de flota (inv.T_LineaEquipo).
 *
 * La línea es el primer nivel: línea > tipo de equipo > equipo > placa.
 * El selector de línea del formulario de tipo de equipo consume este mismo
 * hook, así que al crear una línea nueva aparece ahí sin tocar código.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActualizarLineaEquipo,
  CrearLineaEquipo,
  LineaEquipo,
} from "@congeminco/shared";

/* Lo que devuelve el GET: la fila sin los campos de auditoría. */
export type LineaEquipoFila = Pick<
  LineaEquipo,
  "Id" | "Codigo" | "Nombre" | "Descripcion" | "Orden"
>;

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Error ${res.status}`;
}

/* Una línea nueva (o renombrada) cambia lo que muestra el maestro de tipos:
   hay que invalidar los dos. */
function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["lineas-equipo"] });
  void qc.invalidateQueries({ queryKey: ["tipos-equipo"] });
}

export function useLineasEquipo() {
  return useQuery({
    queryKey: ["lineas-equipo"],
    queryFn: async () => {
      const res = await fetch("/api/lineas-equipo");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar líneas de equipo`);
      return res.json() as Promise<LineaEquipoFila[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrearLineaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearLineaEquipo) => {
      const res = await fetch("/api/lineas-equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<LineaEquipo>;
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useActualizarLineaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ActualizarLineaEquipo }) => {
      const res = await fetch(`/api/lineas-equipo/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await leerError(res));
      return res.json() as Promise<LineaEquipo>;
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useEliminarLineaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/lineas-equipo/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await leerError(res));
    },
    onSuccess: () => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ["dependencias"] });
    },
  });
}
