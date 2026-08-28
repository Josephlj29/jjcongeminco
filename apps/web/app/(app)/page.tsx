"use client";

/**
 * app/(app)/page.tsx — Dashboard (grid bento)
 *
 * Consume un único endpoint agregado (/api/dashboard, gate módulo DASHBOARD),
 * que reemplaza el fan-out anterior a /api/reportes/* (que daba 403 a los roles
 * sin el módulo REPORTES) + /api/saldos. Tiles de tamaños variados: KPI hero con
 * delta y sparkline, KPIs con delta, accesos rápidos, gráficos y lista de bajo
 * mínimo. Cada tile maneja su propio estado de carga/error.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, AlertTriangle, Wallet, ArrowLeftRight } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { moneda, fechaISO, fechaCorta } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AccesosRapidos } from "@/components/dashboard/AccesosRapidos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraficoTendencia } from "@/components/charts/GraficoTendencia";
import { GraficoDonutCategorias } from "@/components/charts/GraficoDonutCategorias";
import { GraficoTopProductos } from "@/components/charts/GraficoTopProductos";

const RANGOS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
] as const;

/** Delta relativo del período actual vs el anterior (0..1, con signo). */
function deltaRelativo(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 1 : 0;
  return (actual - anterior) / anterior;
}

/** Envuelve un tile de gráfico con su propio manejo de carga/error/vacío. */
function TileGrafico({
  titulo,
  cargando,
  error,
  onReintentar,
  vacio,
  hayDatos,
  children,
  className,
}: {
  titulo: string;
  cargando: boolean;
  error: boolean;
  onReintentar: () => void;
  vacio: string;
  hayDatos: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <Skeleton className="h-[280px]" />
        ) : error ? (
          <ErrorState compacto onReintentar={onReintentar} />
        ) : !hayDatos ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            {vacio}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [rango, setRango] = useState<string>("30");

  const { desde, hasta } = useMemo(() => {
    const fin = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - Number(rango));
    return { desde: fechaISO(inicio), hasta: fechaISO(fin) };
  }, [rango]);

  const { data, isLoading: cargando, isError: error, refetch } = useDashboard(desde, hasta);
  const reintentar = () => void refetch();

  const rangoLabel = RANGOS.find((r) => r.value === rango)?.label;
  const kpis = data?.kpis;

  const deltaValorMovido = kpis
    ? deltaRelativo(kpis.anterior.valorMovidoActual, kpis.anterior.valorMovido)
    : 0;
  const deltaMovimientos = kpis
    ? deltaRelativo(kpis.movimientosPeriodo, kpis.anterior.movimientosPeriodo)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descripcion="Resumen del inventario — JJ Congeminco"
        acciones={
          <div className="w-full sm:w-48">
            <Select value={rango} onValueChange={setRango}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {error && !cargando ? (
        <ErrorState
          titulo="No se pudo cargar el dashboard"
          descripcion="Ocurrió un error al obtener el resumen del inventario."
          onReintentar={reintentar}
        />
      ) : (
        <>
          {/* Grid bento */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
            {/* KPI hero: valor de inventario + sparkline de valor movido */}
            <KpiCard
              className="md:col-span-6 lg:col-span-6 lg:row-span-2"
              hero
              titulo="Valor total del inventario"
              valor={cargando ? "…" : moneda(kpis?.valorInventario ?? 0)}
              icono={Wallet}
              descripcion="Stock valorizado a costo promedio"
              delta={{ porcentaje: deltaValorMovido }}
              sparkline={data?.sparklineValor}
              cargando={cargando}
            />

            <KpiCard
              className="md:col-span-3 lg:col-span-3"
              titulo="Productos activos"
              valor={cargando ? "…" : (kpis?.totalProductos ?? 0)}
              icono={Package}
              descripcion="En catálogo"
              cargando={cargando}
            />
            <KpiCard
              className="md:col-span-3 lg:col-span-3"
              titulo="Bajo mínimo"
              valor={cargando ? "…" : (kpis?.bajoMinimo ?? 0)}
              icono={AlertTriangle}
              descripcion="Requieren reabastecimiento"
              tono={(kpis?.bajoMinimo ?? 0) > 0 ? "warning" : "default"}
              cargando={cargando}
            />
            <KpiCard
              className="md:col-span-3 lg:col-span-3"
              titulo="Movimientos del período"
              valor={cargando ? "…" : (kpis?.movimientosPeriodo ?? 0)}
              icono={ArrowLeftRight}
              descripcion={rangoLabel}
              delta={{ porcentaje: deltaMovimientos }}
              cargando={cargando}
            />
            <AccesosRapidos className="md:col-span-3 lg:col-span-3" />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <TileGrafico
              className="lg:col-span-8"
              titulo="Entradas vs salidas por día"
              cargando={cargando}
              error={error}
              onReintentar={reintentar}
              vacio="Sin movimientos en el período."
              hayDatos={(data?.tendencia.length ?? 0) > 0}
            >
              <GraficoTendencia datos={data?.tendencia ?? []} height={280} />
            </TileGrafico>

            <TileGrafico
              className="lg:col-span-4"
              titulo="Valor por categoría"
              cargando={cargando}
              error={error}
              onReintentar={reintentar}
              vacio="Sin datos valorizados."
              hayDatos={(data?.valorPorCategoria.length ?? 0) > 0}
            >
              <GraficoDonutCategorias datos={data?.valorPorCategoria ?? []} height={280} />
            </TileGrafico>

            <TileGrafico
              className="lg:col-span-6"
              titulo="Top productos movidos"
              cargando={cargando}
              error={error}
              onReintentar={reintentar}
              vacio="Sin movimientos en el período."
              hayDatos={(data?.topProductos.length ?? 0) > 0}
            >
              <GraficoTopProductos datos={data?.topProductos ?? []} height={280} />
            </TileGrafico>

            {/* Lista de bajo mínimo */}
            <Card className="lg:col-span-6">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Productos bajo mínimo</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/saldos">Ver todos</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {cargando ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : error ? (
                  <ErrorState compacto onReintentar={reintentar} />
                ) : !data?.bajoMinimo.length ? (
                  <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
                    No hay productos bajo mínimo. ¡Todo en orden!
                  </div>
                ) : (
                  <ul className="divide-y">
                    {data.bajoMinimo.map((p) => (
                      <li
                        key={p.IdProducto}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.NombreProducto}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.Sku} · {p.NombreCategoria}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold text-warning">{p.StockTotal}</span>
                          <span className="text-xs text-muted-foreground">/ {p.StockMinimo}</span>
                          <Badge variant="warning">Bajo</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {data && !cargando && (
            <p className="text-xs text-muted-foreground">
              Datos del {fechaCorta(desde)} al {fechaCorta(hasta)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
