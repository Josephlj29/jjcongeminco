"use client";

/**
 * app/(app)/reportes/page.tsx — Reportes tipo ERP
 *
 * Dos pestañas (shadcn Tabs): Movimientos y Valorizado.
 * Cada una con filtros (+ chips de filtros activos), fila de KPI cards, un
 * gráfico, tabla con subtotales/total y exportación CSV (lib/csv.ts, en memoria).
 *
 * Subtotales: la tabla de Movimientos intercala filas de subtotal por
 * TipoDocumento (los datos vienen ordenados por fecha desc, así que se agrupan
 * en memoria por tipo antes de renderizar) y una fila TOTAL al final.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download } from "lucide-react";
import { useCategorias, useUbicaciones, useProveedores } from "@/hooks/useCatalogo";
import { useEquipos, useVehiculos } from "@/hooks/useEquipos";
import { useProductos } from "@/hooks/useProductos";
import { exportarCsv } from "@/lib/csv";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraficoPorTipoDocumento } from "@/components/charts/GraficoPorTipoDocumento";
import { GraficoDonutCategorias } from "@/components/charts/GraficoDonutCategorias";
import type { ReporteMovimiento, ProductoValorizado } from "@congeminco/shared";
import { TIPO_DOCUMENTO } from "@congeminco/shared";

const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

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

function useReporteMovimientos(filtros: FiltrosMovimiento, habilitado: boolean) {
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

/* KPI compacto para las filas de indicadores de cada pestaña. */
function KpiMini({
  titulo,
  valor,
  acento,
}: {
  titulo: string;
  valor: string;
  acento?: "positivo" | "negativo";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={`text-xl font-bold ${
            acento === "positivo"
              ? "text-emerald-600"
              : acento === "negativo"
                ? "text-red-600"
                : ""
          }`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

export default function ReportesPage() {
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

  const { data: movimientos, isLoading: cargandoMov } = useReporteMovimientos(
    filtros,
    buscarMov
  );
  const { data: valorizado, isLoading: cargandoVal } = useReporteValorizado(
    catValorizado,
    soloBajoMinimo,
    buscarVal
  );

  const setFiltro =
    (campo: keyof FiltrosMovimiento) => (valor: string) =>
      setFiltros((prev) => ({ ...prev, [campo]: valor }));

  /* ── Movimientos: KPIs ── */
  const kpisMov = useMemo(() => {
    const lista = movimientos ?? [];
    let entradas = 0;
    let salidas = 0;
    let neto = 0;
    lista.forEach((m) => {
      if (m.Direccion === 1) entradas += m.ValorMovimiento;
      else salidas += m.ValorMovimiento;
      neto += m.Direccion * m.ValorMovimiento;
    });
    return { entradas, salidas, neto };
  }, [movimientos]);

  /* ── Movimientos: valor por tipo de documento (gráfico) ── */
  const datosPorTipo = useMemo(() => {
    const mapa = new Map<string, number>();
    (movimientos ?? []).forEach((m) => {
      mapa.set(
        m.TipoDocumento,
        (mapa.get(m.TipoDocumento) ?? 0) + m.ValorMovimiento
      );
    });
    return [...mapa.entries()].map(([tipo, valor]) => ({
      tipo: TIPO_LABEL[tipo] ?? tipo,
      valor,
    }));
  }, [movimientos]);

  /* ── Movimientos: agrupado por tipo con subtotales (en memoria) ── */
  const gruposMov = useMemo(() => {
    const mapa = new Map<string, ReporteMovimiento[]>();
    (movimientos ?? []).forEach((m) => {
      const arr = mapa.get(m.TipoDocumento) ?? [];
      arr.push(m);
      mapa.set(m.TipoDocumento, arr);
    });
    return [...mapa.entries()].map(([tipo, filas]) => ({
      tipo,
      filas,
      subtotal: filas.reduce((s, f) => s + f.ValorMovimiento, 0),
    }));
  }, [movimientos]);

  const totalMovValor = useMemo(
    () => (movimientos ?? []).reduce((s, m) => s + m.ValorMovimiento, 0),
    [movimientos]
  );

  /* ── Valorizado: KPIs ── */
  const kpisVal = useMemo(() => {
    const lista = valorizado ?? [];
    return {
      total: lista.reduce((s, v) => s + v.ValorTotal, 0),
      items: lista.length,
      bajoMinimo: lista.filter((v) => v.BajoMinimo).length,
    };
  }, [valorizado]);

  /* ── Valorizado: donut por categoría ── */
  const datosDonutVal = useMemo(() => {
    const mapa = new Map<string, number>();
    (valorizado ?? []).forEach((v) => {
      mapa.set(
        v.NombreCategoria,
        (mapa.get(v.NombreCategoria) ?? 0) + v.ValorTotal
      );
    });
    return [...mapa.entries()]
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [valorizado]);

  /* Chips de filtros activos (movimientos). */
  const chipsFiltros = useMemo(() => {
    const chips: { campo: keyof FiltrosMovimiento; label: string }[] = [];
    if (filtros.desde) chips.push({ campo: "desde", label: `Desde: ${filtros.desde}` });
    if (filtros.hasta) chips.push({ campo: "hasta", label: `Hasta: ${filtros.hasta}` });
    if (filtros.tipoDocumento)
      chips.push({
        campo: "tipoDocumento",
        label: `Tipo: ${TIPO_LABEL[filtros.tipoDocumento] ?? filtros.tipoDocumento}`,
      });
    if (filtros.idCategoria) {
      const c = categorias?.find((x) => x.Id === filtros.idCategoria);
      chips.push({ campo: "idCategoria", label: `Categoría: ${c?.Nombre ?? "—"}` });
    }
    if (filtros.idProducto) {
      const p = productos?.find((x) => x.IdProducto === filtros.idProducto);
      chips.push({ campo: "idProducto", label: `Producto: ${p?.Sku ?? "—"}` });
    }
    if (filtros.idProveedor) {
      const p = proveedores?.find((x) => x.Id === filtros.idProveedor);
      chips.push({ campo: "idProveedor", label: `Proveedor: ${p?.Nombre ?? "—"}` });
    }
    if (filtros.idEquipo) {
      const e = equipos?.find((x) => x.Id === filtros.idEquipo);
      chips.push({ campo: "idEquipo", label: `Equipo: ${e?.Codigo ?? "—"}` });
    }
    if (filtros.idVehiculo) {
      const v = vehiculos?.find((x) => x.Id === filtros.idVehiculo);
      chips.push({ campo: "idVehiculo", label: `Placa: ${v?.Placa ?? "—"}` });
    }
    return chips;
  }, [filtros, categorias, productos, proveedores, equipos, vehiculos]);

  const exportarMovimientos = () => {
    const filas = (movimientos ?? []).map((m) => ({
      Fecha: new Date(m.FechaMovimiento).toLocaleDateString("es-PE"),
      Tipo: TIPO_LABEL[m.TipoDocumento] ?? m.TipoDocumento,
      Producto: m.NombreProducto,
      Ubicacion: m.NombreUbicacion,
      Placa: m.Placa ?? "",
      Cantidad: m.CantidadConSigno,
      Valor: m.ValorMovimiento.toFixed(2),
    }));
    exportarCsv(
      filas,
      [
        { key: "Fecha", label: "Fecha" },
        { key: "Tipo", label: "Tipo" },
        { key: "Producto", label: "Producto" },
        { key: "Ubicacion", label: "Ubicación" },
        { key: "Placa", label: "Placa" },
        { key: "Cantidad", label: "Cantidad" },
        { key: "Valor", label: "Valor (S/)" },
      ],
      "reporte-movimientos"
    );
  };

  const exportarValorizado = () => {
    const filas = (valorizado ?? []).map((p) => ({
      Sku: p.Sku,
      Producto: p.NombreProducto,
      Categoria: p.NombreCategoria,
      Stock: p.StockTotal,
      CostoPromedio: p.CostoPromedio.toFixed(2),
      ValorTotal: p.ValorTotal.toFixed(2),
      BajoMinimo: p.BajoMinimo ? "Sí" : "No",
    }));
    exportarCsv(
      filas,
      [
        { key: "Sku", label: "SKU" },
        { key: "Producto", label: "Producto" },
        { key: "Categoria", label: "Categoría" },
        { key: "Stock", label: "Stock" },
        { key: "CostoPromedio", label: "Costo promedio (S/)" },
        { key: "ValorTotal", label: "Valor total (S/)" },
        { key: "BajoMinimo", label: "Bajo mínimo" },
      ],
      "reporte-valorizado"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">
          Analiza movimientos y stock valorizado
        </p>
      </div>

      <Tabs defaultValue="movimientos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="valorizado">Valorizado</TabsTrigger>
        </TabsList>

        {/* ── Movimientos ── */}
        <TabsContent value="movimientos" className="space-y-6">
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

              {/* Chips de filtros activos */}
              {chipsFiltros.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {chipsFiltros.map((chip) => (
                    <Badge
                      key={chip.campo}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {chip.label}
                      <button
                        type="button"
                        onClick={() => setFiltro(chip.campo)("")}
                        className="rounded-full p-0.5 hover:bg-background/60"
                        aria-label={`Quitar filtro ${chip.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

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
            <>
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
                <div className="space-y-6">
                  {/* KPI cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiMini
                      titulo="Total entradas"
                      valor={moneda(kpisMov.entradas)}
                      acento="positivo"
                    />
                    <KpiMini
                      titulo="Total salidas"
                      valor={moneda(kpisMov.salidas)}
                      acento="negativo"
                    />
                    <KpiMini
                      titulo="Valor neto"
                      valor={moneda(kpisMov.neto)}
                      acento={kpisMov.neto >= 0 ? "positivo" : "negativo"}
                    />
                  </div>

                  {/* Gráfico por tipo */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Valor por tipo de documento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <GraficoPorTipoDocumento datos={datosPorTipo} height={260} />
                    </CardContent>
                  </Card>

                  {/* Tabla con subtotales por tipo */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportarMovimientos}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Exportar CSV
                    </Button>
                  </div>
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
                        {gruposMov.map((grupo) => (
                          <GrupoMovimiento key={grupo.tipo} grupo={grupo} />
                        ))}
                        <TableRow className="bg-muted/60 font-semibold">
                          <TableCell colSpan={6}>TOTAL</TableCell>
                          <TableCell className="text-right">
                            {moneda(totalMovValor)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Valorizado ── */}
        <TabsContent value="valorizado" className="space-y-6">
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

              <Button onClick={() => setBuscarVal(true)}>Generar reporte</Button>
            </CardContent>
          </Card>

          {buscarVal && (
            <>
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
                <div className="space-y-6">
                  {/* KPI cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiMini titulo="Valor total" valor={moneda(kpisVal.total)} />
                    <KpiMini titulo="Ítems" valor={String(kpisVal.items)} />
                    <KpiMini
                      titulo="Ítems bajo mínimo"
                      valor={String(kpisVal.bajoMinimo)}
                      acento={kpisVal.bajoMinimo > 0 ? "negativo" : undefined}
                    />
                  </div>

                  {/* Donut por categoría */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Valor por categoría
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <GraficoDonutCategorias datos={datosDonutVal} height={280} />
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportarValorizado}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Exportar CSV
                    </Button>
                  </div>
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Producto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Costo prom.</TableHead>
                          <TableHead className="text-right">Valor total</TableHead>
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
                              {moneda(p.CostoPromedio)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {moneda(p.ValorTotal)}
                            </TableCell>
                            <TableCell>
                              {p.BajoMinimo && (
                                <Badge variant="warning">Bajo mínimo</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/60 font-semibold">
                          <TableCell colSpan={5}>TOTAL</TableCell>
                          <TableCell className="text-right">
                            {moneda(kpisVal.total)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* Grupo de movimientos de un mismo tipo + fila de subtotal. */
function GrupoMovimiento({
  grupo,
}: {
  grupo: { tipo: string; filas: ReporteMovimiento[]; subtotal: number };
}) {
  return (
    <>
      {grupo.filas.map((m) => (
        <TableRow key={m.IdMovimiento}>
          <TableCell className="text-xs">
            {new Date(m.FechaMovimiento).toLocaleDateString("es-PE")}
          </TableCell>
          <TableCell className="text-xs capitalize">
            {TIPO_LABEL[m.TipoDocumento] ?? m.TipoDocumento}
          </TableCell>
          <TableCell className="text-xs">{m.NombreProducto}</TableCell>
          <TableCell className="text-xs">{m.NombreUbicacion}</TableCell>
          <TableCell className="text-xs font-mono">{m.Placa ?? "—"}</TableCell>
          <TableCell
            className={`text-right text-xs font-medium ${
              m.Direccion === 1 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {m.Direccion === 1 ? "+" : "-"}
            {m.Cantidad}
          </TableCell>
          <TableCell className="text-right text-xs">
            {moneda(m.ValorMovimiento)}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="bg-muted/30">
        <TableCell colSpan={6} className="text-xs font-medium text-right">
          Subtotal {TIPO_LABEL[grupo.tipo] ?? grupo.tipo}
        </TableCell>
        <TableCell className="text-right text-xs font-semibold">
          {moneda(grupo.subtotal)}
        </TableCell>
      </TableRow>
    </>
  );
}
