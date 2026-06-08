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
 * Muestra: conteo de items + botones Anterior/Siguiente + indicador de página.
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
    <div className="flex items-center justify-end gap-4 px-1 pt-3 pb-1">
      <p className="text-sm text-muted-foreground">
        {totalItems === 0
          ? "0 de 0 registros"
          : `Mostrando ${desde}–${hasta} de ${totalItems}`}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>

        <span className="px-3 text-sm text-muted-foreground select-none">
          Página {pagina} de {totalPaginas}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
