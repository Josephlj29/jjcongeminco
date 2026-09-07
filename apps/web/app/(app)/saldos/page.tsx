"use client";

/**
 * app/(app)/saldos/page.tsx — Consulta de saldos (mobile-first)
 *
 * La pantalla más usada en campo (celular). Búsqueda grande con autofocus,
 * chips de categoría, y tarjetas táctiles (≥44px). Tap en una tarjeta abre un
 * Sheet (bottom en móvil, right en desktop) con el detalle: costo promedio,
 * stock mínimo, stock POR UBICACIÓN (fetch lazy) y tipos de equipo compatibles.
 *
 * PAGINADO EN EL SERVIDOR. Antes esta pantalla bajaba el catálogo completo
 * (348 productos con imágenes) más la tabla puente producto↔tipo entera, y
 * filtraba en memoria: dos cargas completas en la pantalla que más se abre y
 * con la peor conexión. Ahora:
 *   · Al entrar trae 10 filas: las de movimiento más reciente.
 *   · El buscador y los chips consultan al servidor, con debounce.
 *   · Los chips salen de una vista de facetas (28 filas), no de los productos.
 *   · Las asociaciones de tipo se piden solo del producto que se abre.
 */
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Search, AlertTriangle, Boxes, Clock, ArrowDownAZ, Loader2 } from "lucide-react";
import type { ProductoStockConsolidado } from "@congeminco/shared";
import { useFacetasCategoria, useSaldosPaginados, useSaldosPorUbicacion } from "@/hooks/useSaldos";
import { useAsociacionesProducto } from "@/hooks/useTiposEquipo";
import { useDebounce } from "@/hooks/useDebounce";
import { fechaCorta, moneda } from "@/lib/format";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { PageHeader } from "@/components/PageHeader";
import { Paginacion } from "@/components/Paginacion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
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

/** Filas por página. 10 es lo que pide el negocio y lo que cabe sin scroll largo. */
const TAMANO_PAGINA = 10;

/* ── Detalle (contenido del Sheet) ── */
function DetalleSaldo({ producto }: { producto: ProductoStockConsolidado }) {
  const { data: porUbicacion, isLoading } = useSaldosPorUbicacion(producto.IdProducto, true);
  const { data: tiposCompatibles } = useAsociacionesProducto(producto.IdProducto);

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
          <p className="font-mono text-xs text-muted-foreground">{producto.Sku}</p>
          <p className="font-semibold leading-tight">{producto.NombreProducto}</p>
          <p className="text-xs text-muted-foreground">{producto.NombreCategoria}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
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
          <p className="text-base font-bold">{moneda(producto.CostoPromedio)}</p>
        </div>
      </div>

      {producto.BajoMinimo && (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Bajo mínimo
        </Badge>
      )}

      {producto.UltimoMovimiento && (
        <p className="text-xs text-muted-foreground">
          Último movimiento: {fechaCorta(producto.UltimoMovimiento)}
        </p>
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
          <p className="text-sm text-muted-foreground">Sin stock en ninguna ubicación.</p>
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
                    <TableCell className="text-sm">{u.NombreUbicacion}</TableCell>
                    <TableCell className="text-right font-medium">{u.CantidadDisponible}</TableCell>
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
        {producto.EsGeneral ? (
          <p className="text-sm text-muted-foreground">
            Producto general (compatible con todos los equipos).
          </p>
        ) : !tiposCompatibles ? (
          <Skeleton className="h-6 w-32" />
        ) : tiposCompatibles.length === 0 ? (
          <Badge variant="warning">Sin clasificar</Badge>
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
   las tarjetas de la grilla en el mismo commit que monta el Sheet, y eso traba
   la animación de apertura. Con props estables (producto + onSelect memoizado)
   la grilla no se vuelve a renderizar al cambiar la selección. */
const TarjetaSaldo = memo(function TarjetaSaldo({
  producto,
  onSelect,
  mostrarFecha,
}: {
  producto: ProductoStockConsolidado;
  onSelect: (p: ProductoStockConsolidado) => void;
  mostrarFecha: boolean;
}) {
  return (
    // div con rol de botón (no <button>): la miniatura interna es un botón
    // propio (ImagenAmpliable) y anidar <button> dentro de <button> es inválido.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(producto)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(producto);
        }
      }}
      className="flex min-h-[68px] cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
    >
      <ImagenAmpliable
        url={producto.UrlImagenPrincipal}
        size={56}
        nombre={producto.NombreProducto}
        alt={producto.NombreProducto}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-tight">{producto.NombreProducto}</p>
        <p className="font-mono text-xs text-muted-foreground">{producto.Sku}</p>
        {/* Ordenando por actividad, la fecha explica por qué esta fila está acá. */}
        {mostrarFecha && producto.UltimoMovimiento && (
          <p className="text-[11px] text-muted-foreground">
            Movió el {fechaCorta(producto.UltimoMovimiento)}
          </p>
        )}
        {producto.BajoMinimo && (
          <Badge variant="warning" className="mt-1">
            Bajo mínimo
          </Badge>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-2xl font-bold leading-none">{producto.StockTotal}</p>
        <p className="text-[11px] text-muted-foreground">{producto.CodigoUnidad}</p>
      </div>
    </div>
  );
});

/* ── Botón de filtro con forma de chip ── */
function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function SaldosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [bajoMinimo, setBajoMinimo] = useState(false);
  const [orden, setOrden] = useState<"recientes" | "nombre">("recientes");
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<ProductoStockConsolidado | null>(null);

  /* El input muestra lo que se tipea; la query sale 350 ms después de la última
     tecla. Sin esto, "filtro de aceite" son 17 requests. */
  const q = useDebounce(busqueda.trim(), 350);

  const { data, isLoading, isFetching, isError, refetch } = useSaldosPaginados({
    q,
    idCategoria: categoria,
    bajoMinimo,
    orden,
    pagina,
    limit: TAMANO_PAGINA,
  });
  const { data: facetas } = useFacetasCategoria();

  const handleSelect = useCallback((p: ProductoStockConsolidado) => setSeleccionado(p), []);

  /* Todo cambio de filtro vuelve a la página 1: si estabas en la 5 y filtras a
     12 resultados, la 5 no existe. Se hace en el handler (no en un efecto) para
     no disparar una request con la página vieja antes del reset. */
  const cambiarFiltro = useCallback((accion: () => void) => {
    accion();
    setPagina(1);
  }, []);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hayFiltro = q !== "" || categoria !== null || bajoMinimo;

  /* El contador se calcula con la página que devolvió el SERVIDOR, no con el
     estado local: mientras llega la página nueva seguimos mostrando las filas
     de la anterior (keepPreviousData), y usar el estado diría "11–20" arriba de
     las filas 1–10. */
  const { desde, hasta } = useMemo(() => {
    const paginaMostrada = data?.pagina ?? pagina;
    return {
      desde: total === 0 ? 0 : (paginaMostrada - 1) * TAMANO_PAGINA + 1,
      hasta: Math.min(paginaMostrada * TAMANO_PAGINA, total),
    };
  }, [data?.pagina, pagina, total]);

  /* Explica QUÉ se está viendo: sin esto, ver 10 de 348 productos parece un bug. */
  const leyenda = hayFiltro
    ? `${total} ${total === 1 ? "resultado" : "resultados"}`
    : orden === "recientes"
      ? "Los productos con movimiento más reciente. Busca por nombre o SKU para ver el resto."
      : "Catálogo en orden alfabético. Busca por nombre o SKU para ir directo a un producto.";

  return (
    <div className="space-y-6">
      <PageHeader titulo="Saldos" descripcion="Consulta el stock disponible de cada producto" />

      {/* Búsqueda grande */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
          placeholder="Buscar por nombre, SKU o código de proveedor..."
          className="h-12 pl-11 pr-10 text-base"
          inputMode="search"
        />
        {/* Señal de que hay una consulta en vuelo, sin vaciar la grilla. */}
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Orden y alertas */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip
          activo={orden === "recientes"}
          onClick={() => cambiarFiltro(() => setOrden("recientes"))}
        >
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Recientes
          </span>
        </Chip>
        <Chip activo={orden === "nombre"} onClick={() => cambiarFiltro(() => setOrden("nombre"))}>
          <span className="flex items-center gap-1.5">
            <ArrowDownAZ className="h-3.5 w-3.5" />
            A-Z
          </span>
        </Chip>
        <span className="my-1 w-px shrink-0 bg-border" aria-hidden />
        <Chip activo={bajoMinimo} onClick={() => cambiarFiltro(() => setBajoMinimo(!bajoMinimo))}>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Bajo mínimo
          </span>
        </Chip>
      </div>

      {/* Chips de categoría — salen de la vista de facetas, no de los productos */}
      {!!facetas?.length && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip activo={categoria === null} onClick={() => cambiarFiltro(() => setCategoria(null))}>
            Todas
          </Chip>
          {facetas.map((c) => (
            <Chip
              key={c.IdCategoria}
              activo={categoria === c.IdCategoria}
              onClick={() => cambiarFiltro(() => setCategoria(c.IdCategoria))}
            >
              {c.NombreCategoria}
              <span className="ml-1.5 opacity-60">{c.Productos}</span>
            </Chip>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{leyenda}</p>

      {/* Resultados */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onReintentar={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          titulo="Sin resultados"
          descripcion={
            hayFiltro
              ? "Ningún producto coincide con esos criterios. Prueba con menos filtros."
              : "Todavía no hay productos activos en el catálogo."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((p) => (
              <TarjetaSaldo
                key={p.IdProducto}
                producto={p}
                onSelect={handleSelect}
                mostrarFecha={orden === "recientes"}
              />
            ))}
          </div>
          {total > TAMANO_PAGINA && (
            <Paginacion
              pagina={pagina}
              totalPaginas={data?.totalPaginas ?? 1}
              totalItems={total}
              desde={desde}
              hasta={hasta}
              onPagina={setPagina}
            />
          )}
        </>
      )}

      {/* Sheet de detalle */}
      <Sheet open={!!seleccionado} onOpenChange={(open) => !open && setSeleccionado(null)}>
        {/* "panel": bottom sheet en celular, panel derecho desde sm (ver ui/sheet.tsx) */}
        <SheetContent side="panel">
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
