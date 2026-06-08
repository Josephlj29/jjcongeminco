"use client";

import { useState, useMemo, useEffect } from "react";

export interface UsePaginacionResult<T> {
  pagina: number;
  setPagina: (n: number) => void;
  totalPaginas: number;
  totalItems: number;
  desde: number;
  hasta: number;
  itemsPagina: T[];
}

/**
 * Hook genérico de paginación client-side.
 * Resetea a página 1 cada vez que cambia la longitud o la referencia de `items`
 * (es decir, cuando cambia el resultado de un filtro).
 */
export function usePaginacion<T>(
  items: T[],
  tamañoPagina = 10
): UsePaginacionResult<T> {
  const [pagina, setPagina] = useState(1);

  // Resetear a página 1 cuando el conjunto filtrado cambia
  useEffect(() => {
    setPagina(1);
  }, [items]);

  const totalItems = items.length;
  const totalPaginas = totalItems === 0 ? 1 : Math.ceil(totalItems / tamañoPagina);

  // Garantizar que la página actual sea válida si los datos cambian
  const paginaValida = Math.min(pagina, totalPaginas);

  const desde = totalItems === 0 ? 0 : (paginaValida - 1) * tamañoPagina + 1;
  const hasta = totalItems === 0 ? 0 : Math.min(paginaValida * tamañoPagina, totalItems);

  const itemsPagina = useMemo(
    () => items.slice((paginaValida - 1) * tamañoPagina, paginaValida * tamañoPagina),
    [items, paginaValida, tamañoPagina]
  );

  return {
    pagina: paginaValida,
    setPagina,
    totalPaginas,
    totalItems,
    desde,
    hasta,
    itemsPagina,
  };
}
