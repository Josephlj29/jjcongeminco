"use client";

/**
 * components/ImagenAmpliable.tsx
 *
 * Miniatura de imagen con tres interacciones:
 *  - Hover (desktop): muestra un preview flotante más grande en un portal a
 *    document.body (no lo recortan tablas, sheets ni contenedores con overflow).
 *  - Doble clic: abre un lightbox a pantalla con zoom (clic alterna 1x / 2x).
 *  - Mantener presionado (táctil, ~600 ms): abre el mismo lightbox — dblclick
 *    no es fiable en móvil (double-tap-to-zoom de Safari/Android).
 *
 * Si no hay URL, renderiza un placeholder estático sin interacción.
 * Render del portal/lightbox solo ocurre client-side (compatible con Workers).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Package, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ImagenAmpliableProps {
  url: string | null;
  size: number;
  alt?: string;
  /** Nombre del producto para el caption del preview y del lightbox. */
  nombre?: string;
  className?: string;
}

const PREVIEW = 224; // w-56 / h-56
// Por debajo del umbral del reconocedor nativo de iOS (~500 ms), que si gana
// emite pointercancel y el nuestro nunca dispara.
const LONG_PRESS_MS = 450;

export function ImagenAmpliable({ url, size, alt = "", nombre, className }: ImagenAmpliableProps) {
  const [hover, setHover] = React.useState(false);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = React.useState(false);
  const [zoom, setZoom] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);

  // Long-press táctil: timer que abre el lightbox; se cancela si el dedo se
  // mueve (scroll) o se levanta antes.
  const pressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigenRef = React.useRef<{ x: number; y: number } | null>(null);

  const cancelarPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    pressOrigenRef.current = null;
  };

  React.useEffect(() => cancelarPress, []);

  // Sin imagen → placeholder estático, sin interacción.
  if (!url) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border bg-muted",
          className,
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
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          pressOrigenRef.current = { x: e.clientX, y: e.clientY };
          pressTimerRef.current = setTimeout(() => {
            cancelarPress();
            setZoom(false);
            setLightbox(true);
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const o = pressOrigenRef.current;
          if (!o) return;
          // El dedo se movió (scroll): no es long-press.
          if (Math.abs(e.clientX - o.x) > 10 || Math.abs(e.clientY - o.y) > 10) cancelarPress();
        }}
        onPointerUp={cancelarPress}
        onPointerCancel={cancelarPress}
        onPointerLeave={cancelarPress}
        // El long-press nativo sobre la imagen (menú contextual en Android)
        // acá significa "ampliar": siempre suprimido en la miniatura.
        onContextMenu={(e) => e.preventDefault()}
        // La miniatura es "zona de imagen": el click simple NO burbujea al
        // contenedor padre (Sheet/fila clicable). Evita dos bugs: el doble
        // clic que abría y cerraba el Sheet, y el click fantasma post
        // long-press que disparaba el onClick del padre.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "group relative shrink-0 cursor-zoom-in select-none overflow-hidden rounded-md border",
          className,
        )}
        // WebkitTouchCallout: iOS no dispara contextmenu; sin esto el callout
        // nativo de imagen ("Guardar imagen…") gana y cancela nuestro gesto.
        style={{ width: size, height: size, WebkitTouchCallout: "none" }}
        title="Doble clic para ampliar"
        aria-label="Ampliar imagen (doble clic o mantener presionado)"
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
              <img src={url} alt={alt} className="h-56 w-56 bg-muted object-contain" />
              {nombre && <p className="max-w-56 truncate px-2 py-1 text-xs">{nombre}</p>}
            </div>
          </div>,
          document.body,
        )}

      {/* Lightbox a pantalla (doble clic) */}
      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{nombre ?? "Imagen del producto"}</DialogTitle>
          <div
            className={cn(
              "flex max-h-[85vh] items-center justify-center bg-muted/40",
              zoom ? "overflow-auto" : "overflow-hidden",
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
                  ? "max-w-none origin-center scale-[1.75] cursor-zoom-out"
                  : "max-h-[85vh] w-auto cursor-zoom-in object-contain",
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
