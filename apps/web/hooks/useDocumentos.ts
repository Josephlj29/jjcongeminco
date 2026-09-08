import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CorregirDocumento,
  CrearDocumento,
  DocumentoInventarioDetalle,
  DocumentoInventarioResumen,
} from "@congeminco/shared";

/** @deprecated usar DocumentoInventarioResumen de @congeminco/shared */
export type DocumentoResumen = DocumentoInventarioResumen;

export function useDocumentos(limit?: number) {
  const qs = limit ? `?limit=${limit}` : "";
  return useQuery({
    queryKey: ["documentos", limit],
    queryFn: async () => {
      const res = await fetch(`/api/documentos${qs}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar documentos`);
      return res.json() as Promise<DocumentoInventarioResumen[]>;
    },
  });
}

/** Detalle para precargar la corrección. Trae la respuesta firme de PuedeCorregir. */
export function useDocumentoDetalle(id: string | null) {
  return useQuery({
    queryKey: ["documentos", "detalle", id],
    enabled: !!id,
    // Un 404/500 acá no se arregla reintentando: que el aviso salga ya.
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/documentos/${id}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el documento`);
      return res.json() as Promise<DocumentoInventarioDetalle>;
    },
  });
}

async function leerError(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `Error ${res.status}`);
}

/* Corregir y anular mueven stock y valorización: invalidan todo lo que los mira. */
function invalidarStock(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["documentos"] });
  void qc.invalidateQueries({ queryKey: ["saldos"] });
  void qc.invalidateQueries({ queryKey: ["kardex"] });
  void qc.invalidateQueries({ queryKey: ["reportes"] });
  void qc.invalidateQueries({ queryKey: ["precios"] });
}

export function useCrearDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrearDocumento) => {
      const res = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await leerError(res);
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
    },
  });
}

/** Anula el documento y registra el corregido. Devuelve el Id del NUEVO documento. */
export function useCorregirDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CorregirDocumento }) => {
      const res = await fetch(`/api/documentos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await leerError(res);
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: () => invalidarStock(qc),
  });
}

/** Anula sin reemplazo. Devuelve el Id del documento de reversa. */
export function useAnularDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, Motivo }: { id: string; Motivo: string }) => {
      const res = await fetch(`/api/documentos/${id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Motivo }),
      });
      if (!res.ok) throw await leerError(res);
      return res.json() as Promise<{ ok: true; IdReversa: string | null }>;
    },
    onSuccess: () => invalidarStock(qc),
  });
}
