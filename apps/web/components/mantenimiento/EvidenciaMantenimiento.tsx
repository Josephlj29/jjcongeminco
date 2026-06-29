"use client";

/**
 * components/mantenimiento/EvidenciaMantenimiento.tsx
 *
 * Gestor de evidencia fotográfica de una OT. Dos secciones: "estado actual"
 * (antes) y "post-mantenimiento" (después). El archivo se sube directo al bucket
 * 'mantenimiento' de Supabase Storage; la URL pública se registra vía endpoint.
 * Mín. 1 de cada tipo para culminar (lo exige la BD); máx. 10 por tipo (lo valida
 * el endpoint). Reutilizable: en el cierre directo y en la reconciliación.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { MAX_EVIDENCIA_MANTENIMIENTO, type TipoEvidencia } from "@congeminco/shared";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  useEvidenciasMantenimiento,
  useCrearEvidenciaMantenimiento,
  useEliminarEvidenciaMantenimiento,
} from "@/hooks/useEvidenciasMantenimiento";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SECCIONES: { tipo: TipoEvidencia; label: string }[] = [
  { tipo: "estado_actual", label: "Estado actual (antes)" },
  { tipo: "post_mantenimiento", label: "Post-mantenimiento (después)" },
];

export function EvidenciaMantenimiento({
  idOrden,
  editable = true,
}: {
  idOrden: string;
  editable?: boolean;
}) {
  const { data: evidencias, isLoading } = useEvidenciasMantenimiento(idOrden);
  const { mutateAsync: crear } = useCrearEvidenciaMantenimiento(idOrden);
  const { mutateAsync: eliminar } = useEliminarEvidenciaMantenimiento(idOrden);
  const [subiendo, setSubiendo] = useState<TipoEvidencia | null>(null);

  const porTipo = (tipo: TipoEvidencia) =>
    (evidencias ?? []).filter((e) => e.Tipo === tipo);

  const handleSubir = async (
    tipo: TipoEvidencia,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    if (porTipo(tipo).length >= MAX_EVIDENCIA_MANTENIMIENTO) {
      toast.error(`Cada tipo admite como máximo ${MAX_EVIDENCIA_MANTENIMIENTO} fotos.`);
      return;
    }

    setSubiendo(tipo);
    try {
      const supabase = crearClienteNavegador();
      const ruta = `${idOrden}/${tipo}/${Date.now()}-${archivo.name}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from("mantenimiento")
        .upload(ruta, archivo, { upsert: false });

      if (storageError) throw new Error(storageError.message);

      const { data: urlData } = supabase.storage
        .from("mantenimiento")
        .getPublicUrl(storageData.path);

      await crear({
        Tipo: tipo,
        Url: urlData.publicUrl,
        Orden: porTipo(tipo).length + 1,
      });
      toast.success("Foto subida correctamente");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubiendo(null);
    }
  };

  const handleEliminar = async (id: string) => {
    try {
      await eliminar(id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <div className="space-y-4">
      {SECCIONES.map(({ tipo, label }) => {
        const fotos = porTipo(tipo);
        const lleno = fotos.length >= MAX_EVIDENCIA_MANTENIMIENTO;
        return (
          <div key={tipo} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {label}{" "}
                <span
                  className={
                    fotos.length === 0
                      ? "text-destructive font-normal"
                      : "text-muted-foreground font-normal"
                  }
                >
                  ({fotos.length}/{MAX_EVIDENCIA_MANTENIMIENTO})
                </span>
              </span>
              {editable && !lleno && (
                <Button asChild type="button" variant="outline" size="sm" disabled={!!subiendo}>
                  <label className="cursor-pointer">
                    <Upload className="mr-1 h-3 w-3" />
                    {subiendo === tipo ? "Subiendo..." : "Subir foto"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!!subiendo}
                      onChange={(e) => void handleSubir(tipo, e)}
                    />
                  </label>
                </Button>
              )}
            </div>

            {fotos.length ? (
              <div className="flex flex-wrap gap-2">
                {fotos.map((f) => (
                  <div key={f.Id} className="relative">
                    <ImagenAmpliable url={f.Url} size={72} alt={label} />
                    {editable && (
                      <button
                        type="button"
                        onClick={() => void handleEliminar(f.Id)}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                        aria-label="Eliminar foto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {editable ? "Sube al menos una foto." : "Sin fotos."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Helper: ¿hay al menos 1 foto de cada tipo? (para habilitar el cierre). */
export function evidenciaCompleta(
  evidencias: { Tipo: TipoEvidencia }[] | undefined
): boolean {
  if (!evidencias) return false;
  return (
    evidencias.some((e) => e.Tipo === "estado_actual") &&
    evidencias.some((e) => e.Tipo === "post_mantenimiento")
  );
}
