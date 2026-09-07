"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  totalItems: number;
  desde: number;
  hasta: number;
  onPagina: (n: number) => void;
}

/**
 * Componente presentacional de paginación.
 *
 * Celular: una sola fila centrada con flechas (icon-only, 40px) y "Página N de M";
 * el conteo de registros se oculta porque no entra en 320px.
 * Desde sm: conteo a la izquierda + botones con texto a la derecha.
 */
export function Paginacion({
  pagina,
  totalPaginas,
  totalItems,
  desde,
  hasta,
  onPagina,
}: PaginacionProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-1 pb-1 pt-3 sm:flex-row sm:justify-end sm:gap-4">
      <p className="hidden text-sm text-muted-foreground sm:block">
        {totalItems === 0 ? "0 de 0 registros" : `Mostrando ${desde}–${hasta} de ${totalItems}`}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-9"
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <span className="select-none px-3 text-sm text-muted-foreground">
          Página {pagina} de {totalPaginas}
        </span>

        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-9"
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Página siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
