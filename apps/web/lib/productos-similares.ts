/**
 * lib/productos-similares.ts — Decisión del control de duplicados al crear.
 *
 * El problema: cada usuario describe la misma pieza a su manera ("Bocina para
 * muelle COUNTY" vs "Buje de muelle county"), no la encuentra en el buscador y
 * crea otra ficha. Antes de guardar, la BD devuelve los productos parecidos
 * (inv.FnProductosSimilares, migración 0085) y esta función decide qué hacer:
 *
 *  - "bloquear": otro producto ya tiene el mismo código de proveedor. El número
 *    de parte es la identidad real del repuesto; la descripción no.
 *  - "confirmar": hay parecidos por nombre. Se le muestran al usuario
 *    ("¿No es alguno de estos?") y decide si de verdad es nuevo.
 *  - "crear": nada parecido, se guarda sin interrumpir.
 */

export type ProductoSimilar = {
  Id: string;
  Sku: string;
  Nombre: string;
  CodigoProductoProveedor: string | null;
  Motivo: "codigo" | "nombre";
  Similitud: number;
};

export type EvaluacionSimilares = {
  accion: "crear" | "confirmar" | "bloquear";
  bloqueante: ProductoSimilar | null;
  parecidos: ProductoSimilar[];
};

export function evaluarSimilares(candidatos: ProductoSimilar[]): EvaluacionSimilares {
  const bloqueante = candidatos.find((c) => c.Motivo === "codigo") ?? null;
  const parecidos = candidatos
    .filter((c) => c !== bloqueante)
    .sort((a, b) => b.Similitud - a.Similitud);

  const accion = bloqueante ? "bloquear" : parecidos.length > 0 ? "confirmar" : "crear";
  return { accion, bloqueante, parecidos };
}
