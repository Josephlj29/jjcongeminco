/**
 * SKU autogenerado: PREFIJO-NNNN (migración 0087).
 *
 * Espeja inv.FnGuardarProducto: el prefijo es T_Categoria.PrefijoSku (3 letras);
 * si la categoría no lo tiene, las 3 primeras letras/dígitos del código sin
 * CAT-/FAM-. El correlativo es el primer libre para ese prefijo. Es solo la
 * previsualización: el servidor reconfirma el número al guardar (y además mira
 * productos eliminados y dados de baja, que el cliente no tiene).
 *
 * El SKU no cambia si después se reclasifica el producto: es un identificador,
 * no una descripción.
 */
export interface CategoriaSku {
  Codigo: string;
  PrefijoSku?: string | null;
}

export function prefijoSku(categoria: CategoriaSku): string | null {
  if (categoria.PrefijoSku) return categoria.PrefijoSku.toUpperCase();
  const base = categoria.Codigo.replace(/^(CAT|FAM)-/i, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return base || null;
}

export function armarSku(
  categoria: CategoriaSku | undefined,
  skusExistentes: string[],
): string | null {
  if (!categoria) return null;
  const prefijo = prefijoSku(categoria);
  if (!prefijo) return null;

  const patron = new RegExp(`^${prefijo}-(\\d{4,})$`);
  const ocupados = new Set<number>();
  for (const sku of skusExistentes) {
    const m = patron.exec(sku.toUpperCase());
    if (m) ocupados.add(Number(m[1]));
  }
  let correlativo = 1;
  while (ocupados.has(correlativo)) correlativo += 1;

  return `${prefijo}-${String(correlativo).padStart(4, "0")}`;
}
