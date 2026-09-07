/**
 * app/api/saldos/route.ts
 *
 * GET /api/saldos — stock consolidado. Cuatro modos, todos sobre el mismo path.
 *
 * 1) PAGINADO (cuando viene ?pagina) → { items, total, pagina, limit, totalPaginas }
 *    Filtros server-side: ?q= (SKU, nombre o código de proveedor),
 *    ?idCategoria=, ?bajoMinimo=true. Orden: ?orden=recientes (default) | nombre.
 *    Es el modo que usa la pantalla de Saldos: trae 10 filas, no el catálogo.
 *
 * 2) FACETAS (?facetas=true) → [{ IdCategoria, NombreCategoria, Productos }]
 *    Los chips de categoría de Saldos. 28 filas chicas en vez de los productos.
 *
 * 3) POR UBICACIÓN (?porUbicacion=true) → inv.V_SaldoStock_PorUbicacion,
 *    con ?idProducto= para el detalle de un producto.
 *
 * 4) LEGACY (sin ningún parámetro de modo) → array completo de la vista.
 *    NO CAMBIAR LA FORMA: lo consumen los combos de producto de requerimientos,
 *    movimientos y consumo de repuestos, que buscan en memoria sobre la lista
 *    entera. Cualquier cambio acá rompe esas tres pantallas.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";

/** Tope duro de filas por página: la UI pide 10, pero nadie puede pedir 5000. */
const LIMITE_MAXIMO = 100;
const LIMITE_DEFECTO = 10;

/**
 * PostgREST arma los filtros como `columna.operador.valor` y separa las
 * condiciones de un `or=(...)` por comas. Una coma o un paréntesis escritos en
 * el buscador rompen el filtro completo (y devuelven un 400 raro), así que se
 * quitan en vez de escaparse. También se van los comodines de LIKE para que
 * "50%" no signifique "cualquier cosa".
 */
function limpiarBusqueda(texto: string): string {
  return texto
    .replace(/[,()%*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function enteroEnRango(valor: string | null, defecto: number, minimo: number, maximo: number) {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(Math.max(n, minimo), maximo);
}

export async function GET(request: NextRequest) {
  const { error } = await autenticarRequest();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const supabase = await crearClienteServidor();

  /* ── Modo 2: facetas de categoría ── */
  if (searchParams.get("facetas") === "true") {
    const { data, error: dbError } = await supabase
      .schema("inv")
      .from("V_Producto_FacetaCategoria")
      .select("*")
      .order("Productos", { ascending: false })
      .order("NombreCategoria");

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  /* ── Modo 3: stock por ubicación ── */
  if (searchParams.get("porUbicacion") === "true") {
    const idProducto = searchParams.get("idProducto");

    let query = supabase.schema("inv").from("V_SaldoStock_PorUbicacion").select("*");

    if (idProducto) {
      query = query.eq("IdProducto", idProducto);
    }

    // Red anti-OOM: sin idProducto esto trae todos los pares producto×ubicación.
    const { data, error: dbError } = await query.limit(5000);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  /* ── Modo 1: paginado con filtros en el servidor ── */
  if (searchParams.has("pagina")) {
    const pagina = enteroEnRango(searchParams.get("pagina"), 1, 1, 100000);
    const limit = enteroEnRango(searchParams.get("limit"), LIMITE_DEFECTO, 1, LIMITE_MAXIMO);
    const q = limpiarBusqueda(searchParams.get("q") ?? "");
    const idCategoria = searchParams.get("idCategoria");
    const orden = searchParams.get("orden") === "nombre" ? "nombre" : "recientes";

    let query = supabase
      .schema("inv")
      .from("V_Producto_StockConsolidado")
      .select("*", { count: "exact" });

    if (q) {
      query = query.or(
        `Sku.ilike.%${q}%,NombreProducto.ilike.%${q}%,CodigoProductoProveedor.ilike.%${q}%`,
      );
    }
    if (idCategoria) {
      query = query.eq("IdCategoria", idCategoria);
    }
    if (searchParams.get("bajoMinimo") === "true") {
      query = query.eq("BajoMinimo", true);
    }

    if (orden === "recientes") {
      // NULLS LAST: un producto sin saldo en ninguna ubicación nunca se movió,
      // y no debe encabezar la vista de actividad reciente.
      query = query.order("UltimoMovimiento", { ascending: false, nullsFirst: false });
    }
    // Desempate SIEMPRE, y hasta una clave única. Sin orden total, Postgres
    // puede devolver los empates en distinto orden en cada request y una fila
    // se repite en dos páginas mientras otra no aparece nunca. Fecha y nombre
    // NO alcanzan: en el catálogo hay tres "Filtro de aceite SAKURA" y dos
    // "Correa 7pk1715", todos con el timestamp de la carga inicial. El SKU es
    // único, así que cierra el orden.
    query = query.order("NombreProducto", { ascending: true }).order("Sku", { ascending: true });

    const desde = (pagina - 1) * limit;
    const { data, count, error: dbError } = await query.range(desde, desde + limit - 1);

    if (dbError) {
      // PGRST103 = rango pedido más allá del total (los datos se encogieron
      // entre dos requests). Es una página vacía, no un error para el usuario.
      if (dbError.code === "PGRST103") {
        return NextResponse.json({ items: [], total: 0, pagina, limit, totalPaginas: 1 });
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const total = count ?? 0;
    return NextResponse.json({
      items: data ?? [],
      total,
      pagina,
      limit,
      totalPaginas: Math.max(Math.ceil(total / limit), 1),
    });
  }

  /* ── Modo 4: legacy, catálogo completo (combos de producto) ── */
  let query = supabase.schema("inv").from("V_Producto_StockConsolidado").select("*");

  if (searchParams.get("bajoMinimo") === "true") {
    query = query.eq("BajoMinimo", true);
  }

  const { data, error: dbError } = await query.order("NombreProducto").limit(5000);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
