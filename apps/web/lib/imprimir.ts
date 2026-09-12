/**
 * lib/imprimir.ts — Utilidades compartidas de los documentos imprimibles.
 *
 * Los "PDF" de la app (OT de mantenimiento, solicitud de requerimiento) son un
 * HTML autocontenido que se escribe en una ventana nueva y se manda a
 * `window.print()`. Acá vive lo común: el escape de HTML, la espera de imágenes
 * antes de imprimir y la apertura de la ventana. Las funciones puras no tocan
 * `window`, así se testean en node.
 */

/** Escapa texto para HTML. Incluye comillas: sirve también dentro de atributos (src, alt). */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lo mínimo de HTMLImageElement que necesita esperarImagenes (así se testea sin DOM). */
export interface ImagenImprimible {
  complete: boolean;
  naturalWidth: number;
  addEventListener(tipo: "load" | "error", fn: () => void, opciones?: { once: boolean }): void;
}

/**
 * Resuelve cuando todas las imágenes cargaron o fallaron, o al vencer el timeout:
 * una imagen colgada nunca debe impedir imprimir. `alFallar` recibe cada imagen
 * rota (incluidas las que ya venían rotas de caché) para reemplazarla por un
 * placeholder antes de abrir el diálogo.
 */
export function esperarImagenes<T extends ImagenImprimible>(
  imagenes: ArrayLike<T>,
  { timeoutMs = 8000, alFallar }: { timeoutMs?: number; alFallar?: (img: T) => void } = {},
): Promise<void> {
  const pendientes: T[] = [];
  for (const img of Array.from(imagenes)) {
    if (!img.complete) pendientes.push(img);
    else if (img.naturalWidth === 0) alFallar?.(img);
  }
  if (!pendientes.length) return Promise.resolve();

  return new Promise((resolve) => {
    let restantes = pendientes.length;
    const timer = setTimeout(resolve, timeoutMs);
    const listo = () => {
      restantes -= 1;
      if (restantes === 0) {
        clearTimeout(timer);
        resolve();
      }
    };
    for (const img of pendientes) {
      img.addEventListener("load", listo, { once: true });
      img.addEventListener(
        "error",
        () => {
          alFallar?.(img);
          listo();
        },
        { once: true },
      );
    }
  });
}

/**
 * Abre el documento en una ventana nueva y lanza el diálogo de impresión recién
 * cuando sus imágenes terminaron de cargar (o fallaron). Si el usuario cierra la
 * ventana mientras carga, no se imprime nada y no se lanza error.
 */
export async function abrirDocumentoImpresion(
  html: string,
  opciones: { alFallarImagen?: (img: HTMLImageElement) => void } = {},
): Promise<void> {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) throw new Error("Permite las ventanas emergentes para generar el PDF.");
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  // El parseo de document.write es síncrono y los eventos load/error llegan en
  // tareas posteriores, así que los listeners se enganchan a tiempo.
  await esperarImagenes(win.document.images, { alFallar: opciones.alFallarImagen });
  if (win.closed) return;
  win.print();
}
