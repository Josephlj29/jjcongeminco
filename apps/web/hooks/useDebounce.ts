"use client";

import { useEffect, useState } from "react";

/**
 * Retrasa un valor hasta que deja de cambiar por `ms`.
 *
 * Para buscadores que consultan al servidor: sin esto, "filtro de aceite" son
 * 17 requests. El valor devuelto es el que se manda a la query; el input sigue
 * mostrando lo que el usuario tipea, así que no se siente lento.
 */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [retrasado, setRetrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return retrasado;
}
