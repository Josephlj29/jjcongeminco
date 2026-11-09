/**
 * lib/baja-producto.ts — Qué acciones de baja ve el usuario sobre un producto.
 *
 * "Dar de baja" no es "Eliminar". Eliminar solo procede si el producto no tiene
 * nada enlazado (un alta por error). Un duplicado histórico siempre tiene
 * kardex, así que nunca se podía eliminar y quedaba visible para siempre.
 * Darlo de baja lo CONSERVA (el kardex y los documentos viejos siguen
 * mostrando su nombre) pero lo oculta a todos los roles menos admin.
 *
 * Solo con saldo 0: primero se pasa el stock al producto bueno con un
 * documento, después se da de baja. La BD revalida todo (FnDarDeBajaProducto,
 * migración 0086); esto solo decide qué botones mostrar.
 */
import { puede, type RoleCode } from "@congeminco/shared";

export function accionesDeBaja(
  producto: { StockTotal: number; DadoDeBaja?: boolean | null },
  rol: RoleCode | null | undefined,
): { darDeBaja: boolean; reactivar: boolean } {
  if (!puede(rol, "productoBaja")) return { darDeBaja: false, reactivar: false };
  const dadoDeBaja = producto.DadoDeBaja === true;
  return {
    darDeBaja: !dadoDeBaja && Number(producto.StockTotal) === 0,
    reactivar: dadoDeBaja,
  };
}
