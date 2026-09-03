"use client";

/**
 * components/AvisoBorrador.tsx
 *
 * Aviso de que el formulario se rellenó con un borrador recuperado (ver
 * hooks/useBorradorFormulario).
 *
 * Por qué se avisa en vez de rellenar en silencio: si el formulario aparece con
 * datos y el usuario no sabe de dónde salieron, no distingue entre "esto lo
 * escribí yo hace un rato" y "esto es un registro real". El aviso, con la hora
 * y una salida en un clic, elimina esa duda.
 */
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fechaHora } from "@/lib/format";

export function AvisoBorrador({
  guardadoEn,
  onDescartar,
}: {
  guardadoEn: Date | null;
  onDescartar: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <History className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="text-xs leading-tight">
          Recuperamos lo que estabas cargando
          {guardadoEn ? ` el ${fechaHora(guardadoEn)}` : ""}. Revisá que esté todo antes de guardar.{" "}
          <strong>Las fotos hay que volver a adjuntarlas.</strong>
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2 text-amber-800 hover:text-amber-900 dark:text-amber-300"
        onClick={onDescartar}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        Descartar
      </Button>
    </div>
  );
}
