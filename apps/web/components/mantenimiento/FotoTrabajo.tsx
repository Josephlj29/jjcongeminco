"use client";

/**
 * components/mantenimiento/FotoTrabajo.tsx
 *
 * Slot compacto de UNA foto opcional por tarea de la OT ("Antes" o "Después").
 * Sin foto: botón punteado que abre el selector nativo. En el celular ese
 * selector ofrece cámara o galería; en campo las fotos ya suelen estar en la
 * galería (se registran al terminar el trabajo), por eso NO se fuerza `capture`.
 * Con foto: miniatura ampliable + X para quitarla.
 *
 * La foto vive en el padre: archivo local pendiente de subir (preview =
 * objectURL) o URL ya subida a Storage (file = null, edición de OTs legadas).
 */
import { Camera, X } from "lucide-react";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { cn } from "@/lib/utils";

export interface FotoLocal {
  /** Archivo pendiente de subir; null si la URL ya está en Storage. */
  file: File | null;
  preview: string;
}

export function FotoTrabajo({
  etiqueta,
  foto,
  onSeleccionar,
  onQuitar,
  disabled = false,
}: {
  etiqueta: "Antes" | "Después";
  foto: FotoLocal | null;
  onSeleccionar: (file: File) => void;
  onQuitar: () => void;
  disabled?: boolean;
}) {
  if (foto) {
    return (
      <div className="relative w-fit">
        {/* ImagenAmpliable renderiza un <button>: la X va como hermano absoluto. */}
        <div className="flex flex-col items-center gap-0.5">
          <ImagenAmpliable url={foto.preview} size={40} alt={`Foto ${etiqueta}`} nombre={etiqueta} />
          <span className="text-[10px] leading-none text-muted-foreground">{etiqueta}</span>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onQuitar}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
            aria-label={`Quitar foto ${etiqueta}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <label
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Camera className="h-3.5 w-3.5 shrink-0" />
      {etiqueta}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // permite volver a elegir el mismo archivo
          if (file) onSeleccionar(file);
        }}
      />
    </label>
  );
}
