"use client";

/**
 * components/GaleriaProductoDialog.tsx
 *
 * Modal con las imágenes de un producto. Una imagen → la muestra grande; varias
 * → carrusel con flechas (‹ ›), contador y flechas del teclado. Usado al elegir
 * un producto en Movimientos para ampliar/ver todas sus fotos.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useImagenesProducto } from "@/hooks/useImagenes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export function GaleriaProductoDialog({
  idProducto,
  nombre,
  open,
  onClose,
}: {
  idProducto: string | null;
  nombre?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: imagenes, isLoading } = useImagenesProducto(open ? idProducto : null);
  const [index, setIndex] = useState(0);

  // Principal primero, luego por Orden.
  const imgs = useMemo(
    () =>
      (imagenes ?? [])
        .slice()
        .sort(
          (a, b) =>
            Number(b.EsPrincipal) - Number(a.EsPrincipal) || a.Orden - b.Orden
        ),
    [imagenes]
  );

  // Reinicia el índice al abrir otro producto.
  useEffect(() => {
    setIndex(0);
  }, [idProducto, open]);

  const total = imgs.length;
  const ir = (delta: number) =>
    setIndex((i) => (total ? (i + delta + total) % total : 0));

  // Flechas del teclado.
  useEffect(() => {
    if (!open || total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total]);

  const actual = imgs[Math.min(index, Math.max(total - 1, 0))];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {nombre ?? "Imágenes del producto"}
            {total > 1 && (
              <span className="text-sm font-normal text-muted-foreground">
                {index + 1} / {total}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-[60vh] w-full" />
        ) : total === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Package className="h-10 w-10" />
            <p className="text-sm">Este producto no tiene imágenes cargadas.</p>
          </div>
        ) : (
          <div className="relative flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={actual.Url}
              alt={nombre ?? ""}
              className="max-h-[70vh] w-auto rounded-md object-contain"
            />

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => ir(-1)}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => ir(1)}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Tira de miniaturas (si hay varias) */}
        {total > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imgs.map((img, i) => (
              <button
                key={img.Id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${
                  i === index ? "border-primary" : "border-transparent opacity-60"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.Url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
