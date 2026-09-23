/**
 * lib/buscar.ts — Coincidencia de texto para los buscadores en memoria.
 *
 * Fuente única del criterio "¿este registro coincide con lo que escribió el
 * usuario?" para las listas y selects que filtran en el navegador (catálogo de
 * productos, Combobox). Antes cada pantalla tenía el suyo: el Combobox
 * normalizaba acentos y el catálogo no, así que "cañería" encontraba cosas
 * distintas según dónde lo escribieras.
 *
 * Los campos se comparan UNO POR UNO, no concatenados: un término no puede
 * "saltar" del nombre al SKU y dar un falso positivo.
 */

/** "Cañería" -> "caneria": búsqueda insensible a acentos y mayúsculas. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * true si el término aparece en alguno de los campos. Un término vacío no
 * filtra (devuelve true), que es lo que espera un buscador recién abierto.
 */
export function coincideBusqueda(
  campos: Array<string | null | undefined>,
  termino: string,
): boolean {
  const q = normalizarTexto(termino.trim());
  if (!q) return true;
  return campos.some((campo) => !!campo && normalizarTexto(campo).includes(q));
}
