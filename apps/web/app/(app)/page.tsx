"use client";

/**
 * app/(app)/page.tsx — Dashboard con gráficos
 *
 * Client Component (TanStack Query + ECharts).
 * - 4 KPI cards: total productos, valor total inventario, bajo mínimo,
 *   movimientos del período.
 * - Select de rango (7/30/90 días) que define desde/hasta.
 * - Gráficos: tendencia entradas/salidas por día, donut de valor por categoría,
 *   top 5 productos por cantidad movida. Los datos de los gráficos se agregan en
 *   memoria a partir de /api/reportes/movimientos y /api/reportes/valorizado.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  AlertTriangle,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import type { ReporteMovimiento, ProductoValorizado } from "@congeminco/shared";
import { useSaldos, useSaldosBajoMinimo } from "@/hooks/useSaldos";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function fechaISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function moneda(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard({
  titulo,
  valor,
  icono: Icono,
  descripcion,
  variante = "default",
}: {
  titulo: string;
  valor: number | string;
  icono: React.ElementType;
  descripcion?: string;
  variante?: "default" | "warning";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <Icono
          className={`h-4 w-4 ${
            variante === "warning" ? "text-amber-500" : "text-muted-foreground"
          }`}
        />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            variante === "warning" ? "text-amber-600" : ""
          }`}
        >
          {valor}
        </div>
        {descripcion && (
          <p className="text-xs text-muted-foreground">{descripcion}</p>
        )}
      </CardContent>
    </Card>
  );
}

function useReporteMovimientos(desde: string, hasta: string) {
  return useQuery({
    queryKey: ["reportes", "movimientos", "dashboard", desde, hasta],
    queryFn: async () => {
      const params = new URLSearchParams({ desde, hasta });
      const res = await fetch(`/api/reportes/movimientos?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar movimientos");
      return res.json() as Promise<ReporteMovimiento[]>;
    },
  });
}

function useReporteValorizado() {
  return useQuery({
    queryKey: ["reportes", "valorizado", "dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/reportes/valorizado");
      if (!res.ok) throw new Error("Error al cargar valorizado");
      return res.json() as Promise<ProductoValorizado[]>;
    },
  });
}

export default function DashboardPage() {
  const [rango, setRango] = useState<string>("30");

  const { desde, hasta } = useMemo(() => {
    const fin = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - Number(rango));
    return { desde: fechaISO(inicio), hasta: fechaISO(fin) };
  }, [rango]);

  const { data: saldos, isLoading: cargandoSaldos } = useSaldos();
  const { data: bajoMinimo, isLoading: cargandoBM } = useSaldosBajoMinimo();
  const { data: movimientos, isLoading: cargandoMov } = useReporteMovimientos(
    desde,
    hasta
  );
  const { data: valorizado, isLoading: cargandoVal } = useReporteValorizado();

  const totalProductos = saldos?.length ?? 0;
  const totalBajoMinimo = bajoMinimo?.length ?? 0;
  const valorInventario = useMemo(
    () => (valorizado ?? []).reduce((sum, v) => sum + v.ValorTotal, 0),
    [valorizado]
  );
  const totalMovimientos = movimientos?.length ?? 0;

  /* Tendencia: entradas vs salidas por día (Direccion 1 = entrada, -1 = salida). */
  const datosTendencia = useMemo(() => {
    const mapa = new Map<string, { entradas: number; salidas: number }>();
    (movimientos ?? []).forEach((m) => {
      const fecha = m.FechaMovimiento.split("T")[0];
      const acc = mapa.get(fecha) ?? { entradas: 0, salidas: 0 };
      if (m.Direccion === 1) acc.entradas += m.Cantidad;
      else acc.salidas += m.Cantidad;
      mapa.set(fecha, acc);
    });
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({
        fecha: new Date(fecha).toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "2-digit",
        }),
        entradas: v.entradas,
        salidas: v.salidas,
      }));
  }, [movimientos]);

  /* Donut: valor por categoría (suma ValorTotal del valorizado). */
  const datosDonut = useMemo(() => {
    const mapa = new Map<string, number>();
    (valorizado ?? []).forEach((v) => {
      mapa.set(v.NombreCategoria, (mapa.get(v.NombreCategoria) ?? 0) + v.ValorTotal);
    });
    return [...mapa.entries()]
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [valorizado]);

  /* Top 5 productos por cantidad movida en el período. */
  const datosTop = useMemo(() => {
    const mapa = new Map<string, number>();
    (movimientos ?? []).forEach((m) => {
      mapa.set(m.NombreProducto, (mapa.get(m.NombreProducto) ?? 0) + m.Cantidad);
    });
    return [...mapa.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
      .reverse(); // barras horizontales: mayor arriba
  }, [movimientos]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Resumen del inventario — JJ Congeminco
          </p>
        </div>
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
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cargandoSaldos ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <KpiCard
              titulo="Total de productos"
              valor={totalProductos}
              icono={Package}
              descripcion="Productos activos en catálogo"
            />
            <KpiCard
              titulo="Valor total inventario"
              valor={cargandoVal ? "…" : moneda(valorInventario)}
              icono={Wallet}
              descripcion="Stock valorizado a costo promedio"
            />
            <KpiCard
              titulo="Bajo mínimo"
              valor={totalBajoMinimo}
              icono={AlertTriangle}
              descripcion="Requieren reabastecimiento"
              variante={totalBajoMinimo > 0 ? "warning" : "default"}
            />
            <KpiCard
              titulo="Movimientos del período"
              valor={cargandoMov ? "…" : totalMovimientos}
              icono={ArrowLeftRight}
              descripcion={RANGOS.find((r) => r.value === rango)?.label}
            />
          </>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Entradas vs salidas por día
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargandoMov ? (
              <Skeleton className="h-[300px]" />
            ) : datosTendencia.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sin movimientos en el período.
              </div>
            ) : (
              <GraficoTendencia datos={datosTendencia} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valor por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {cargandoVal ? (
              <Skeleton className="h-[300px]" />
            ) : datosDonut.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sin datos valorizados.
              </div>
            ) : (
              <GraficoDonutCategorias datos={datosDonut} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top productos movidos (período)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cargandoMov ? (
            <Skeleton className="h-[300px]" />
          ) : datosTop.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Sin movimientos en el período.
            </div>
          ) : (
            <GraficoTopProductos datos={datosTop} />
          )}
        </CardContent>
      </Card>

      {/* Tabla de productos bajo mínimo */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Productos bajo mínimo</h2>
        {cargandoBM ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !bajoMinimo?.length ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed h-32 text-muted-foreground text-sm">
            No hay productos bajo mínimo. ¡Todo en orden!
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock mínimo</TableHead>
                  <TableHead className="text-right">Stock actual</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bajoMinimo.map((p) => (
                  <TableRow key={p.IdProducto}>
                    <TableCell className="font-mono text-xs">{p.Sku}</TableCell>
                    <TableCell className="font-medium">
                      {p.NombreProducto}
                    </TableCell>
                    <TableCell>{p.NombreCategoria}</TableCell>
                    <TableCell className="text-right">{p.StockMinimo}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-600">
                      {p.StockTotal}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Bajo mínimo</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
