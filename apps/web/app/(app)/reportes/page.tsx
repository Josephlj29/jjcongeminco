"use client";

/**
 * app/(app)/reportes/page.tsx — Reportes de movimientos y stock valorizado
 *
 * Filtros: fecha desde/hasta, producto, categoría, proveedor, equipo, placa, tipo
 * Dos pestañas: Movimientos y Valorizado
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { useCategorias, useUbicaciones, useProveedores } from "@/hooks/useCatalogo";
import { useEquipos, useVehiculos } from "@/hooks/useEquipos";
import { useProductos } from "@/hooks/useProductos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { ReporteMovimiento, ProductoValorizado } from "@congeminco/shared";
import { TIPO_DOCUMENTO } from "@congeminco/shared";

const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

type Pestaña = "movimientos" | "valorizado";

interface FiltrosMovimiento {
  desde: string;
  hasta: string;
  idProducto: string;
  idCategoria: string;
  idProveedor: string;
  idUbicacion: string;
  idVehiculo: string;
  idEquipo: string;
  tipoDocumento: string;
}

const FILTROS_INICIAL: FiltrosMovimiento = {
  desde: "",
  hasta: "",
  idProducto: "",
  idCategoria: "",
  idProveedor: "",
  idUbicacion: "",
  idVehiculo: "",
  idEquipo: "",
  tipoDocumento: "",
};

function useReporteMovimientos(
  filtros: FiltrosMovimiento,
  habilitado: boolean
) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });

  return useQuery({
    queryKey: ["reportes", "movimientos", filtros],
    queryFn: async () => {
      const res = await fetch(`/api/reportes/movimientos?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar reporte");
      return res.json() as Promise<ReporteMovimiento[]>;
    },
    enabled: habilitado,
  });
}

function useReporteValorizado(
  idCategoria: string,
  soloBajoMinimo: boolean,
  habilitado: boolean
) {
  const params = new URLSearchParams();
  if (idCategoria) params.set("idCategoria", idCategoria);
  if (soloBajoMinimo) params.set("soloBajoMinimo", "true");

  return useQuery({
    queryKey: ["reportes", "valorizado", idCategoria, soloBajoMinimo],
    queryFn: async () => {
      const res = await fetch(`/api/reportes/valorizado?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar reporte valorizado");
      return res.json() as Promise<ProductoValorizado[]>;
    },
    enabled: habilitado,
  });
}

export default function ReportesPage() {
  const [pestaña, setPestaña] = useState<Pestaña>("movimientos");
  const [filtros, setFiltros] = useState<FiltrosMovimiento>(FILTROS_INICIAL);
  const [buscarMov, setBuscarMov] = useState(false);
  const [catValorizado, setCatValorizado] = useState("");
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const [buscarVal, setBuscarVal] = useState(false);

  const { data: categorias } = useCategorias();
  const { data: ubicaciones } = useUbicaciones();
  const { data: proveedores } = useProveedores();
  const { data: equipos } = useEquipos();
  const { data: vehiculos } = useVehiculos();
  const { data: productos } = useProductos();

  const { data: movimientos, isLoading: cargandoMov } =
    useReporteMovimientos(filtros, buscarMov);
  const { data: valorizado, isLoading: cargandoVal } =
    useReporteValorizado(catValorizado, soloBajoMinimo, buscarVal);

  const paginacionMov = usePaginacion(movimientos ?? [], 15);

  const setFiltro =
    (campo: keyof FiltrosMovimiento) => (valor: string) =>
      setFiltros((prev) => ({ ...prev, [campo]: valor }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">
          Analizá movimientos y stock valorizado
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b pb-0">
        {(["movimientos", "valorizado"] as Pestaña[]).map((p) => (
          <button
            key={p}
            onClick={() => setPestaña(p)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              pestaña === p
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {p === "movimientos" ? "Movimientos" : "Valorizado"}
          </button>
        ))}
      </div>

      {/* ── Movimientos ── */}
      {pestaña === "movimientos" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="desde">Desde</Label>
                  <Input
                    id="desde"
                    type="date"
                    value={filtros.desde}
                    onChange={(e) => setFiltro("desde")(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hasta">Hasta</Label>
                  <Input
                    id="hasta"
                    type="date"
                    value={filtros.hasta}
                    onChange={(e) => setFiltro("hasta")(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tipo documento</Label>
                  <Select onValueChange={setFiltro("tipoDocumento")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_DOCUMENTO.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select onValueChange={setFiltro("idCategoria")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias?.map((c) => (
                        <SelectItem key={c.Id} value={c.Id}>
                          {c.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label>Producto</Label>
                  <Select onValueChange={setFiltro("idProducto")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos..." />
                    </SelectTrigger>
                    <SelectContent>
                      {productos?.map((p) => (
                        <SelectItem key={p.IdProducto} value={p.IdProducto}>
                          {p.Sku} — {p.NombreProducto}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Proveedor</Label>
                  <Select onValueChange={setFiltro("idProveedor")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos..." />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores?.map((p) => (
                        <SelectItem key={p.Id} value={p.Id}>
                          {p.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Equipo</Label>
                  <Select onValueChange={setFiltro("idEquipo")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos..." />
                    </SelectTrigger>
                    <SelectContent>
                      {equipos?.map((e) => (
                        <SelectItem key={e.Id} value={e.Id}>
                          {e.Codigo} — {e.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Placa</Label>
                  <Select onValueChange={setFiltro("idVehiculo")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vehiculos?.map((v) => (
                        <SelectItem key={v.Id} value={v.Id}>
                          {v.Placa}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => setBuscarMov(true)}>
                  Generar reporte
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFiltros(FILTROS_INICIAL);
                    setBuscarMov(false);
                  }}
                >
                  Limpiar
                </Button>
              </div>
            </CardContent>
          </Card>

          {buscarMov && (
            <div>
              {cargandoMov ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !movimientos?.length ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed h-28 text-muted-foreground text-sm">
                  No se encontraron movimientos con esos filtros.
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginacionMov.itemsPagina.map((m) => (
                        <TableRow key={m.IdMovimiento}>
                          <TableCell className="text-xs">
                            {new Date(m.FechaMovimiento).toLocaleDateString(
                              "es-PE"
                            )}
                          </TableCell>
                          <TableCell className="text-xs capitalize">
                            {TIPO_LABEL[m.TipoDocumento] ?? m.TipoDocumento}
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.NombreProducto}
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.NombreUbicacion}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {m.Placa ?? "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right text-xs font-medium ${
                              m.Direccion === 1
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {m.Direccion === 1 ? "+" : "-"}
                            {m.Cantidad}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            S/ {m.ValorMovimiento.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Paginacion
                    pagina={paginacionMov.pagina}
                    totalPaginas={paginacionMov.totalPaginas}
                    totalItems={paginacionMov.totalItems}
                    desde={paginacionMov.desde}
                    hasta={paginacionMov.hasta}
                    onPagina={paginacionMov.setPagina}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Valorizado ── */}
      {pestaña === "valorizado" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select onValueChange={setCatValorizado}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias?.map((c) => (
                        <SelectItem key={c.Id} value={c.Nombre}>
                          {c.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soloBajoMinimo}
                      onChange={(e) => setSoloBajoMinimo(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Solo bajo mínimo
                  </label>
                </div>
              </div>

              <Button onClick={() => setBuscarVal(true)}>
                Generar reporte
              </Button>
            </CardContent>
          </Card>

          {buscarVal && (
            <div>
              {cargandoVal ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !valorizado?.length ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed h-28 text-muted-foreground text-sm">
                  No se encontraron productos con esos filtros.
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">
                          Costo prom.
                        </TableHead>
                        <TableHead className="text-right">
                          Valor total
                        </TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valorizado.map((p) => (
                        <TableRow key={p.IdProducto}>
                          <TableCell className="font-mono text-xs">
                            {p.Sku}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {p.NombreProducto}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.NombreCategoria}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.StockTotal}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            S/ {p.CostoPromedio.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            S/ {p.ValorTotal.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {p.BajoMinimo && (
                              <Badge variant="warning">Bajo mínimo</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
