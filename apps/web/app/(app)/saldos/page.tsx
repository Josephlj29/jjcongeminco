"use client";

/**
 * app/(app)/saldos/page.tsx — Consulta de saldos (mobile-first)
 *
 * La pantalla más usada en campo (celular). Búsqueda grande con autofocus,
 * chips de categoría, y tarjetas táctiles (≥44px). Tap en una tarjeta abre un
 * Sheet (bottom en móvil, right en desktop) con el detalle: costo promedio,
 * stock mínimo, stock POR UBICACIÓN (fetch lazy) y tipos de equipo compatibles.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { Search, Package, AlertTriangle, Boxes } from "lucide-react";
import type { ProductoStockConsolidado } from "@congeminco/shared";
import { useSaldos, useSaldosPorUbicacion } from "@/hooks/useSaldos";
import { useAsociacionesTiposEquipo } from "@/hooks/useTiposEquipo";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ImagenProducto({
  url,
  size,
}: {
  url: string | null;
  size: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="rounded-md object-cover shrink-0 border"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-md bg-muted shrink-0 border"
      style={{ width: size, height: size }}
    >
      <Package
        className="text-muted-foreground"
        style={{ width: size * 0.45, height: size * 0.45 }}
      />
    </div>
  );
}

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

/* ── Detalle (contenido del Sheet) ── */
function DetalleSaldo({ producto }: { producto: ProductoStockConsolidado }) {
  const { data: porUbicacion, isLoading } = useSaldosPorUbicacion(
    producto.IdProducto,
    true
  );
  const { data: asociaciones } = useAsociacionesTiposEquipo();

  const tiposCompatibles = useMemo(
    () =>
      (asociaciones ?? []).filter((a) => a.IdProducto === producto.IdProducto),
    [asociaciones, producto.IdProducto]
  );

  return (
    <div className="space-y-6 overflow-y-auto pb-6">
      <div className="flex items-center gap-4">
        <ImagenAmpliable
          url={producto.UrlImagenPrincipal}
          size={72}
          nombre={producto.NombreProducto}
          alt={producto.NombreProducto}
        />
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {producto.Sku}
          </p>
          <p className="font-semibold leading-tight">
            {producto.NombreProducto}
          </p>
          <p className="text-xs text-muted-foreground">
            {producto.NombreCategoria}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Stock total</p>
          <p className="text-xl font-bold">{producto.StockTotal}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Mínimo</p>
          <p className="text-xl font-bold">{producto.StockMinimo}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Costo prom.</p>
          <p className="text-base font-bold">
            {moneda(producto.CostoPromedio)}
          </p>
        </div>
      </div>

      {producto.BajoMinimo && (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Bajo mínimo
        </Badge>
      )}

      {/* Stock por ubicación */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Stock por ubicación</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !porUbicacion?.length ? (
          <p className="text-sm text-muted-foreground">
            Sin stock en ninguna ubicación.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porUbicacion.map((u) => (
                  <TableRow key={u.IdUbicacion}>
                    <TableCell className="text-sm">
                      {u.NombreUbicacion}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {u.CantidadDisponible}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Tipos de equipo compatibles */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Equipos compatibles</h3>
        {tiposCompatibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Producto general (compatible con todos los equipos).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiposCompatibles.map((t) => (
              <Badge key={t.Id} variant="secondary">
                {t.NombreTipoEquipo}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tarjeta de producto (memoizada) ──
   Crítico para el rendimiento: sin memo, seleccionar un producto re-renderiza
   las cientos de tarjetas de la grilla en el mismo commit que monta el Sheet,
   y eso traba la animación de apertura. Con props estables (producto + onSelect
   memoizado) la grilla no se vuelve a renderizar al cambiar la selección. */
const TarjetaSaldo = memo(function TarjetaSaldo({
  producto,
  onSelect,
}: {
  producto: ProductoStockConsolidado;
  onSelect: (p: ProductoStockConsolidado) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(producto)}
      className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 min-h-[68px]"
    >
      <ImagenProducto url={producto.UrlImagenPrincipal} size={56} />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight truncate">
          {producto.NombreProducto}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{producto.Sku}</p>
        {producto.BajoMinimo && (
          <Badge variant="warning" className="mt-1">
            Bajo mínimo
          </Badge>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-2xl font-bold leading-none">{producto.StockTotal}</p>
        <p className="text-[11px] text-muted-foreground">
          {producto.CodigoUnidad}
        </p>
      </div>
    </button>
  );
});

export default function SaldosPage() {
  const { data: saldos, isLoading } = useSaldos();
  // Precarga las asociaciones producto↔tipo para que la sección "Equipos
  // compatibles" del detalle aparezca al instante al abrir el Sheet.
  useAsociacionesTiposEquipo();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] =
    useState<ProductoStockConsolidado | null>(null);

  const handleSelect = useCallback(
    (p: ProductoStockConsolidado) => setSeleccionado(p),
    []
  );

  /* Categorías presentes en los datos (para los chips). */
  const categorias = useMemo(() => {
    const mapa = new Map<string, string>();
    (saldos ?? []).forEach((s) => {
      if (!mapa.has(s.IdCategoria)) mapa.set(s.IdCategoria, s.NombreCategoria);
    });
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [saldos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (saldos ?? []).filter((s) => {
      const coincideTexto =
        !q ||
        s.Sku.toLowerCase().includes(q) ||
        s.NombreProducto.toLowerCase().includes(q);
      const coincideCategoria = !categoria || s.IdCategoria === categoria;
      return coincideTexto && coincideCategoria;
    });
  }, [saldos, busqueda, categoria]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Saldos</h1>
        <p className="text-sm text-muted-foreground">
          Consultá el stock disponible de cada producto
        </p>
      </div>

      {/* Búsqueda grande */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="h-12 pl-11 text-base"
          inputMode="search"
        />
      </div>

      {/* Chips de categoría */}
      {categorias.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setCategoria(null)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              categoria === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoria(c.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                categoria === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Resultados */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Boxes}
          titulo="Sin resultados"
          descripcion="No se encontraron productos con esos criterios de búsqueda."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((p) => (
            <TarjetaSaldo
              key={p.IdProducto}
              producto={p}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {/* Sheet de detalle */}
      <Sheet
        open={!!seleccionado}
        onOpenChange={(open) => !open && setSeleccionado(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto sm:inset-y-0 sm:right-0 sm:bottom-auto sm:max-h-none sm:h-full sm:w-3/4 sm:max-w-md"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Detalle de producto</SheetTitle>
            <SheetDescription className="sr-only">
              Stock por ubicación y compatibilidad
            </SheetDescription>
          </SheetHeader>
          {seleccionado && <DetalleSaldo producto={seleccionado} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
