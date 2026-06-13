"use client";

/**
 * components/ImagenAmpliable.tsx
 *
 * Miniatura de imagen con dos interacciones:
 *  - Hover (desktop): muestra un preview flotante más grande en un portal a
 *    document.body (no lo recortan tablas, sheets ni contenedores con overflow).
 *  - Doble clic: abre un lightbox a pantalla con zoom (clic alterna 1x / 2x).
 *
 * Si no hay URL, renderiza un placeholder estático sin interacción.
 * Render del portal/lightbox solo ocurre client-side (compatible con Workers).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Package, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImagenAmpliableProps {
  url: string | null;
  size: number;
  alt?: string;
  /** Nombre del producto para el caption del preview y del lightbox. */
  nombre?: string;
  className?: string;
}

const PREVIEW = 224; // w-56 / h-56

export function ImagenAmpliable({
  url,
  size,
  alt = "",
  nombre,
  className,
}: ImagenAmpliableProps) {
  const [hover, setHover] = React.useState(false);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(
    null
  );
  const [lightbox, setLightbox] = React.useState(false);
  const [zoom, setZoom] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);

  // Sin imagen → placeholder estático, sin interacción.
  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted shrink-0 border",
          className
        )}
        style={{ width: size, height: size }}
      >
        <Package
          className="text-muted-foreground"
          style={{ width: size * 0.45, height: size * 0.45 }}
        />
      </div>
    );
  }

  const actualizarPosicion = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || typeof window === "undefined") return;
    let x = r.right + 12;
    if (x + PREVIEW > window.innerWidth) x = r.left - PREVIEW - 12; // voltea a la izquierda
    if (x < 8) x = 8;
    let y = r.top;
    if (y + PREVIEW + 28 > window.innerHeight) y = window.innerHeight - PREVIEW - 36;
    if (y < 8) y = 8;
    setCoords({ x, y });
  };

  return (
    <>
      <button
        type="button"
        ref={ref}
        onMouseEnter={() => {
          actualizarPosicion();
          setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setHover(false);
          setZoom(false);
          setLightbox(true);
        }}
        className={cn(
          "group relative shrink-0 cursor-zoom-in overflow-hidden rounded-md border",
          className
        )}
        style={{ width: size, height: size }}
        title="Doble clic para ampliar"
        aria-label="Ampliar imagen (doble clic)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
          <ZoomIn className="h-4 w-4" />
        </span>
      </button>

      {/* Preview flotante al pasar el mouse (portal → sin recortes; solo desktop) */}
      {hover &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80] hidden animate-in fade-in-0 zoom-in-95 sm:block"
            style={{ left: coords.x, top: coords.y }}
          >
            <div className="overflow-hidden rounded-lg border bg-background shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={alt}
                className="h-56 w-56 bg-muted object-contain"
              />
              {nombre && (
                <p className="max-w-56 truncate px-2 py-1 text-xs">{nombre}</p>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Lightbox a pantalla (doble clic) */}
      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{nombre ?? "Imagen del producto"}</DialogTitle>
          <div
            className={cn(
              "flex max-h-[85vh] items-center justify-center bg-muted/40",
              zoom ? "overflow-auto" : "overflow-hidden"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              onClick={() => setZoom((z) => !z)}
              className={cn(
                "select-none transition-transform duration-200",
                zoom
                  ? "max-w-none cursor-zoom-out scale-[1.75] origin-center"
                  : "max-h-[85vh] w-auto cursor-zoom-in object-contain"
              )}
            />
          </div>
          {nombre && (
            <p className="absolute bottom-0 left-0 right-0 truncate bg-background/90 px-4 py-2 text-sm font-medium backdrop-blur">
              {nombre}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
