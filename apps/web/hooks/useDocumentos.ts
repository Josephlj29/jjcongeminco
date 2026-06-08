import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrearDocumento } from "@congeminco/shared";

export interface DocumentoResumen {
  Id: string;
  TipoDocumento: string;
  FechaDocumento: string;
  NumeroDocumento: string | null;
  Comprobante: string | null;
  Referencia: string | null;
  Notas: string | null;
  Estado: boolean;
  FechaCreacion: string;
  UsuarioCreacion: string;
}

export function useDocumentos(limit?: number) {
  const qs = limit ? `?limit=${limit}` : "";
  return useQuery({
    queryKey: ["documentos", limit],
    queryFn: async () => {
      const res = await fetch(`/api/documentos${qs}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar documentos`);
      return res.json() as Promise<DocumentoResumen[]>;
    },
  });
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
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return res.json() as Promise<{ Id: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["saldos"] });
    },
  });
}
