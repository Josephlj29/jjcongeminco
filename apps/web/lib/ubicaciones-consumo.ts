/**
 * lib/ubicaciones-consumo.ts — Almacenes de origen que ofrece el editor de
 * repuestos de una OT.
 *
 * Qué almacenes puede usar cada rol vive en la base (seg.T_RolUbicacionConsumo,
 * migración 0081) y llega en /api/yo como `ubicacionesConsumo`: null si el rol no
 * tiene restricción. La base rechaza igual un almacén no permitido; esto solo
 * evita ofrecer una opción que después falla al guardar.
 */

/** Los almacenes que el usuario puede elegir. null = sin restricción. */
export function ubicacionesConsumo<T extends { Id: string }>(
  ubicaciones: readonly T[] | undefined,
  permitidas: readonly string[] | null,
): T[] {
  if (!ubicaciones) return [];
  if (permitidas === null) return [...ubicaciones];
  return ubicaciones.filter((u) => permitidas.includes(u.Id));
}

/**
 * Almacén a dejar seleccionado: si hay uno solo posible se elige solo, y una
 * elección que dejó de estar permitida (p. ej. una OT cargada por otro rol) se
 * reemplaza. Con la lista aún vacía (cargando) no se toca nada.
 */
export function ubicacionConsumoPorDefecto(
  opciones: readonly { Id: string }[],
  actual: string,
): string {
  if (!opciones.length) return actual;
  if (actual && opciones.some((u) => u.Id === actual)) return actual;
  return opciones.length === 1 ? opciones[0]!.Id : "";
}
