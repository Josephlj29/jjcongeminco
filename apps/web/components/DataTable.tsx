"use client";

/**
 * DataTable — tabla estándar de la app con ciclo de vida integrado:
 * cargando (skeleton con header real, sin layout shift) → error (ErrorState
 * con reintentar) → vacío (EmptyState) → datos + paginación + kebab de acciones.
 *
 * Es presentacional puro: la página conserva diálogos, mutaciones y toasts.
 * Paginación client-side vía usePaginacion (datos completos en memoria).
 */
import * as React from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Paginacion } from "@/components/Paginacion";
import { usePaginacion } from "@/hooks/usePaginacion";
import { cn } from "@/lib/utils";

export interface ColumnaDataTable<T> {
  id: string;
  titulo: React.ReactNode;
  celda: (fila: T) => React.ReactNode;
  alineacion?: "derecha" | "centro";
  /** Se aplica a TableHead y TableCell (ej. "font-mono text-xs", "w-24"). */
  className?: string;
  ocultarEnMovil?: boolean;
}

export interface AccionFila<T> {
  label: string;
  icono?: LucideIcon;
  onClick: (fila: T) => void;
  /** "destructiva" = text-destructive + separador arriba. */
  variante?: "default" | "destructiva";
  visible?: (fila: T) => boolean;
  deshabilitada?: (fila: T) => boolean;
}

interface DataTableProps<T> {
  columnas: ColumnaDataTable<T>[];
  datos: T[] | undefined;
  obtenerId: (fila: T) => string;
  cargando?: boolean;
  error?: boolean;
  onReintentar?: () => void;
  vacio: {
    icono: LucideIcon;
    titulo: string;
    descripcion?: string;
    accion?: React.ReactNode;
  };
  /** Kebab por fila. undefined o [] = sin columna de acciones. */
  acciones?: AccionFila<T>[];
  /** Filas por página. 0 = sin paginar. */
  tamañoPagina?: number;
  onClickFila?: (fila: T) => void;
  className?: string;
}

function claseAlineacion(alineacion?: "derecha" | "centro") {
  if (alineacion === "derecha") return "text-right";
  if (alineacion === "centro") return "text-center";
  return undefined;
}

export function DataTable<T>({
  columnas,
  datos,
  obtenerId,
  cargando = false,
  error = false,
  onReintentar,
  vacio,
  acciones,
  tamañoPagina = 10,
  onClickFila,
  className,
}: DataTableProps<T>) {
  const filas = React.useMemo(() => datos ?? [], [datos]);
  const paginacion = usePaginacion(filas, tamañoPagina || filas.length || 1);
  const filasVisibles = tamañoPagina > 0 ? paginacion.itemsPagina : filas;

  const hayAcciones = (acciones?.length ?? 0) > 0;
  const totalColumnas = columnas.length + (hayAcciones ? 1 : 0);
  const filasSkeleton = tamañoPagina > 0 ? Math.min(tamañoPagina, 6) : 6;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columnas.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    claseAlineacion(col.alineacion),
                    col.ocultarEnMovil && "hidden md:table-cell",
                    col.className,
                  )}
                >
                  {col.titulo}
                </TableHead>
              ))}
              {hayAcciones && (
                <TableHead className="w-14 text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargando ? (
              Array.from({ length: filasSkeleton }).map((_, i) => (
                <TableRow key={i}>
                  {columnas.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(col.ocultarEnMovil && "hidden md:table-cell")}
                    >
                      <Skeleton className="h-5 w-full max-w-40" />
                    </TableCell>
                  ))}
                  {hayAcciones && (
                    <TableCell>
                      <Skeleton className="ml-auto h-5 w-8" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={totalColumnas}>
                  <ErrorState onReintentar={onReintentar} />
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumnas}>
                  <EmptyState
                    icon={vacio.icono}
                    titulo={vacio.titulo}
                    descripcion={vacio.descripcion}
                    accion={vacio.accion}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filasVisibles.map((fila) => (
                <TableRow
                  key={obtenerId(fila)}
                  className={cn(onClickFila && "cursor-pointer")}
                  onClick={onClickFila ? () => onClickFila(fila) : undefined}
                >
                  {columnas.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        claseAlineacion(col.alineacion),
                        col.ocultarEnMovil && "hidden md:table-cell",
                        col.className,
                      )}
                    >
                      {col.celda(fila)}
                    </TableCell>
                  ))}
                  {hayAcciones && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <MenuAcciones fila={fila} acciones={acciones!} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {tamañoPagina > 0 && !cargando && !error && paginacion.totalPaginas > 1 && (
        <Paginacion
          pagina={paginacion.pagina}
          totalPaginas={paginacion.totalPaginas}
          totalItems={paginacion.totalItems}
          desde={paginacion.desde}
          hasta={paginacion.hasta}
          onPagina={paginacion.setPagina}
        />
      )}
    </div>
  );
}

function MenuAcciones<T>({ fila, acciones }: { fila: T; acciones: AccionFila<T>[] }) {
  const visibles = acciones.filter((a) => a.visible?.(fila) ?? true);
  if (visibles.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Abrir menú de acciones">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibles.map((accion, i) => {
          const Icono = accion.icono;
          const esDestructiva = accion.variante === "destructiva";
          return (
            <React.Fragment key={accion.label}>
              {esDestructiva && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={cn(esDestructiva && "text-destructive focus:text-destructive")}
                disabled={accion.deshabilitada?.(fila) ?? false}
                onClick={() => accion.onClick(fila)}
              >
                {Icono && <Icono className="mr-2 h-4 w-4" />}
                {accion.label}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
