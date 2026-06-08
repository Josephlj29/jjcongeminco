"use client";

/**
 * app/(app)/page.tsx — Dashboard
 *
 * Client Component porque usa TanStack Query para los KPIs y la tabla.
 * Muestra:
 * - KPIs: total de productos, bajo mínimo, ubicaciones activas
 * - Tabla de productos bajo mínimo
 */
import { Package, AlertTriangle, MapPin } from "lucide-react";
import { useSaldos, useSaldosBajoMinimo } from "@/hooks/useSaldos";
import { useUbicaciones } from "@/hooks/useCatalogo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function DashboardPage() {
  const { data: saldos, isLoading: cargandoSaldos } = useSaldos();
  const { data: bajoMinimo, isLoading: cargandoBM } = useSaldosBajoMinimo();
  const { data: ubicaciones } = useUbicaciones();

  const totalProductos = saldos?.length ?? 0;
  const totalBajoMinimo = bajoMinimo?.length ?? 0;
  const totalUbicaciones = ubicaciones?.length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen del inventario — JJ Congeminco
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        {cargandoSaldos ? (
          <>
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
              titulo="Bajo mínimo"
              valor={totalBajoMinimo}
              icono={AlertTriangle}
              descripcion="Requieren reabastecimiento"
              variante={totalBajoMinimo > 0 ? "warning" : "default"}
            />
            <KpiCard
              titulo="Ubicaciones"
              valor={totalUbicaciones}
              icono={MapPin}
              descripcion="Almacenes y proyectos activos"
            />
          </>
        )}
      </div>

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
          <div className="rounded-lg border">
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
                    <TableCell className="text-right">
                      {p.StockMinimo}
                    </TableCell>
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
