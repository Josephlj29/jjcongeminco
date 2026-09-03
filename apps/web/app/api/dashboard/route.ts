/**
 * app/api/dashboard/route.ts
 *
 * GET /api/dashboard?desde&hasta — resumen agregado del inventario.
 *
 * Reemplaza el fan-out que hacía el cliente a /api/reportes/movimientos +
 * /api/reportes/valorizado + /api/saldos. Motivos:
 *  - Esos endpoints exigen el módulo REPORTES; el dashboard lo ven todos los
 *    roles (dashboard). Antes los KPIs/gráficos daban 403 para almacenero y
 *    logística. Este endpoint solo exige el módulo DASHBOARD.
 *  - La agregación (tendencia, top, valor por categoría, deltas) se hace en el
 *    servidor, no en el navegador.
 *
 * Fuentes: inv.V_Reporte_Movimiento (rango extendido al doble para el período
 * anterior) e inv.V_Producto_Valorizado. Sin migración SQL: las vistas ya
 * permiten SELECT a cualquier autenticado (RLS). Si el volumen crece, promover
 * la agregación a una RPC dedicada.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { fechaISO } from "@/lib/format";
import {
  puedeVerModulo,
  MODULOS,
  type ProductoValorizado,
  type ReporteMovimiento,
  type ResumenDashboard,
} from "@congeminco/shared";

/* Día calendario en hora de Lima (ver lib/format.ts y migración 0065). */
const iso = fechaISO;

export async function GET(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;
  if (!puedeVerModulo(usuario.modulos, MODULOS.DASHBOARD)) {
    return respuestaError("No tienes permiso para ver el dashboard.", 403);
  }

  const { searchParams } = new URL(request.url);
  const hastaParam = searchParams.get("hasta");
  const desdeParam = searchParams.get("desde");
  const hasta = hastaParam ?? iso(new Date());
  const desde = desdeParam ?? iso(new Date(Date.now() - 30 * 86400000));

  // Longitud del período (en días) para calcular el rango anterior de igual tamaño.
  const msPeriodo = new Date(hasta).getTime() - new Date(desde).getTime();
  const desdeAnterior = iso(new Date(new Date(desde).getTime() - msPeriodo - 86400000));

  const supabase = await crearClienteServidor();

  const [movRes, valRes] = await Promise.all([
    supabase
      .schema("inv")
      .from("V_Reporte_Movimiento")
      .select("FechaMovimiento, Direccion, Cantidad, NombreProducto, ValorMovimiento")
      .gte("FechaMovimiento", desdeAnterior)
      .lte("FechaMovimiento", `${hasta}T23:59:59`)
      .order("FechaMovimiento", { ascending: true })
      .limit(20000),
    supabase
      .schema("inv")
      .from("V_Producto_Valorizado")
      .select(
        "IdProducto, Sku, NombreProducto, NombreCategoria, StockMinimo, StockTotal, ValorTotal, BajoMinimo",
      )
      .limit(5000),
  ]);

  if (movRes.error) return NextResponse.json({ error: movRes.error.message }, { status: 500 });
  if (valRes.error) return NextResponse.json({ error: valRes.error.message }, { status: 500 });

  const movimientos = (movRes.data ?? []) as Pick<
    ReporteMovimiento,
    "FechaMovimiento" | "Direccion" | "Cantidad" | "NombreProducto" | "ValorMovimiento"
  >[];
  const valorizado = (valRes.data ?? []) as Pick<
    ProductoValorizado,
    | "IdProducto"
    | "Sku"
    | "NombreProducto"
    | "NombreCategoria"
    | "StockMinimo"
    | "StockTotal"
    | "ValorTotal"
    | "BajoMinimo"
  >[];

  const enPeriodoActual = (fechaISO: string) => fechaISO.split("T")[0] >= desde;

  // KPIs de stock desde el valorizado (una fila por producto).
  const valorInventario = valorizado.reduce((s, v) => s + v.ValorTotal, 0);
  const bajoMinimoLista = valorizado.filter((v) => v.BajoMinimo);

  // Tendencia (entradas vs salidas por día), top productos y sparkline: período actual.
  const tendenciaMapa = new Map<string, { entradas: number; salidas: number }>();
  const topMapa = new Map<string, number>();
  const valorPorDia = new Map<string, number>();
  let movimientosPeriodo = 0;
  let valorMovidoActual = 0;

  // Período anterior: solo contadores para deltas.
  let movimientosAnterior = 0;
  let valorMovidoAnterior = 0;

  for (const m of movimientos) {
    const dia = m.FechaMovimiento.split("T")[0];
    if (enPeriodoActual(dia)) {
      movimientosPeriodo += 1;
      valorMovidoActual += m.ValorMovimiento ?? 0;
      const t = tendenciaMapa.get(dia) ?? { entradas: 0, salidas: 0 };
      if (m.Direccion === 1) t.entradas += m.Cantidad;
      else t.salidas += m.Cantidad;
      tendenciaMapa.set(dia, t);
      topMapa.set(m.NombreProducto, (topMapa.get(m.NombreProducto) ?? 0) + m.Cantidad);
      valorPorDia.set(dia, (valorPorDia.get(dia) ?? 0) + (m.ValorMovimiento ?? 0));
    } else {
      movimientosAnterior += 1;
      valorMovidoAnterior += m.ValorMovimiento ?? 0;
    }
  }

  const valorPorCategoria = new Map<string, number>();
  for (const v of valorizado) {
    valorPorCategoria.set(
      v.NombreCategoria,
      (valorPorCategoria.get(v.NombreCategoria) ?? 0) + v.ValorTotal,
    );
  }

  const resumen: ResumenDashboard = {
    kpis: {
      totalProductos: valorizado.length,
      valorInventario,
      bajoMinimo: bajoMinimoLista.length,
      movimientosPeriodo,
      anterior: {
        valorMovido: valorMovidoAnterior,
        valorMovidoActual,
        movimientosPeriodo: movimientosAnterior,
      },
    },
    tendencia: [...tendenciaMapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({ fecha, entradas: v.entradas, salidas: v.salidas })),
    valorPorCategoria: [...valorPorCategoria.entries()]
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor),
    topProductos: [...topMapa.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5),
    bajoMinimo: bajoMinimoLista
      .sort((a, b) => a.StockTotal - b.StockTotal)
      .slice(0, 5)
      .map((v) => ({
        IdProducto: v.IdProducto,
        Sku: v.Sku,
        NombreProducto: v.NombreProducto,
        NombreCategoria: v.NombreCategoria,
        StockMinimo: v.StockMinimo,
        StockTotal: v.StockTotal,
      })),
    sparklineValor: [...valorPorDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, valor]) => valor),
  };

  return NextResponse.json(resumen);
}
