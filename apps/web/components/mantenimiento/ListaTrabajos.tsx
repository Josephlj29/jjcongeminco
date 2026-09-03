"use client";

/**
 * components/mantenimiento/ListaTrabajos.tsx
 *
 * Lista numerada de los trabajos de una OT con sus fotos por tarea (antes /
 * después) cuando existen. Solo lectura: la usan el detalle y la aprobación.
 */
import type { TrabajoMantenimiento } from "@congeminco/shared";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";

function Miniatura({
  url,
  etiqueta,
  descripcion,
}: {
  url: string | null;
  etiqueta: string;
  descripcion: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ImagenAmpliable
        url={url}
        size={40}
        alt={`${etiqueta}: ${descripcion}`}
        nombre={`${etiqueta} · ${descripcion}`}
      />
      <span className="text-[10px] leading-none text-muted-foreground">{etiqueta}</span>
    </div>
  );
}

export function ListaTrabajos({ trabajos }: { trabajos: TrabajoMantenimiento[] }) {
  if (!trabajos.length) {
    return <p className="text-sm text-muted-foreground">Sin trabajos registrados.</p>;
  }
  return (
    <ol className="space-y-2 text-sm">
      {trabajos.map((t) => {
        const conFotos = !!(t.UrlFotoAntes || t.UrlFotoDespues);
        return (
          <li key={t.Id} className="flex items-start gap-2">
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
              {t.Secuencia}.
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
              <span className="min-w-[10rem] flex-1">{t.Descripcion}</span>
              {conFotos && (
                <div className="flex gap-3">
                  <Miniatura url={t.UrlFotoAntes} etiqueta="Antes" descripcion={t.Descripcion} />
                  <Miniatura
                    url={t.UrlFotoDespues}
                    etiqueta="Después"
                    descripcion={t.Descripcion}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
