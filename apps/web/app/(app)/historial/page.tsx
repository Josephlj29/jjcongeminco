"use client";

/**
 * Historial de documentos — solo admin (documentoHistorial).
 *
 * Movimientos lista los documentos recientes; acá está TODO el historial,
 * filtrado y paginado en el servidor, con columnas para reconocer un
 * documento sin abrir el kardex (origen/destino, valor, quién lo cargó, quién
 * lo anuló). Desde acá se corrige o anula un documento viejo, con los mismos
 * diálogos y la misma regla de BD que en Movimientos.
 */
import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Loader2, Lock, Pencil, Search, Undo2, X } from "lucide-react";
import {
  esTipoCorregible,
  TIPO_DOCUMENTO,
  type DocumentoHistorial,
  type TipoDocumento,
} from "@congeminco/shared";
import { toast } from "sonner";
import { useDocumentoDetalle, useHistorialDocumentos } from "@/hooks/useDocumentos";
import { useSaldos } from "@/hooks/useSaldos";
import { useDebounce } from "@/hooks/useDebounce";
import { fechaCorta, fechaHora, moneda } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type AccionFila, type ColumnaDataTable } from "@/components/DataTable";
import { Paginacion } from "@/components/Paginacion";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { DialogCorregirDocumento } from "@/components/movimientos/DialogCorregirDocumento";
import { DialogAnularDocumento } from "@/components/movimientos/DialogAnularDocumento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

/* Radix Select no admite value="": "todos" es el centinela de "sin filtro". */
const TODOS = "todos";

const FILTROS_VACIOS = {
  desde: "",
  hasta: "",
  tipo: "",
  situacion: "",
  busqueda: "",
  registradoPor: "",
  idProducto: null as string | null,
};

/** Origen → destino según el tipo, con proveedor y placa cuando aplican. */
function descripcionMovimiento(d: DocumentoHistorial): string {
  const partes: string[] = [];
  if (d.NombreUbicacionOrigen && d.NombreUbicacionDestino) {
    partes.push(`${d.NombreUbicacionOrigen} → ${d.NombreUbicacionDestino}`);
  } else if (d.NombreUbicacionOrigen) {
    partes.push(`Sale de ${d.NombreUbicacionOrigen}`);
  } else if (d.NombreUbicacionDestino) {
    partes.push(`Ingresa a ${d.NombreUbicacionDestino}`);
  }
  if (d.NombreProveedor) partes.push(`Prov. ${d.NombreProveedor}`);
  if (d.Placa) partes.push(`Placa ${d.Placa}`);
  return partes.join(" · ") || "—";
}

/* Corregir/anular se ofrecen por tipo y situación; si igual está bloqueado
   (algo se consumió), la acción queda deshabilitada y el motivo se ve en la fila. */
const esEditable = (d: DocumentoHistorial) =>
  d.Situacion === "confirmado" && esTipoCorregible(d.TipoDocumento as TipoDocumento);

const COLUMNAS: ColumnaDataTable<DocumentoHistorial>[] = [
  {
    id: "fecha",
    titulo: "Fecha",
    celda: (d) => (
      <div className="flex flex-col">
        <span>{fechaCorta(d.FechaDocumento)}</span>
        <span className="text-[11px] text-muted-foreground">
          Cargado {fechaHora(d.FechaRegistro)}
        </span>
      </div>
    ),
    className: "text-xs whitespace-nowrap",
  },
  {
    id: "documento",
    titulo: "Documento",
    celda: (d) => (
      <div className="flex flex-col">
        <span className="font-mono">{d.NumeroDocumento ?? "—"}</span>
        <span className="text-[11px] text-muted-foreground">
          {TIPO_LABEL[d.TipoDocumento] ?? d.TipoDocumento}
        </span>
      </div>
    ),
    className: "text-xs",
  },
  {
    id: "comprobante",
    titulo: "Comprobante / Ref.",
    celda: (d) => (
      <div className="flex flex-col">
        <span>{d.Comprobante ?? "—"}</span>
        {d.Referencia && (
          <span className="max-w-48 truncate text-[11px] text-muted-foreground" title={d.Referencia}>
            {d.Referencia}
          </span>
        )}
      </div>
    ),
    className: "text-xs",
    ocultarEnMovil: true,
  },
  {
    id: "movimiento",
    titulo: "Movimiento",
    celda: (d) => (
      <span className="line-clamp-2 max-w-64" title={descripcionMovimiento(d)}>
        {descripcionMovimiento(d)}
      </span>
    ),
    className: "text-xs",
    ocultarEnMovil: true,
  },
  {
    id: "items",
    titulo: "Ítems",
    celda: (d) => d.CantidadItems,
    alineacion: "derecha",
    className: "text-xs tabular-nums",
    ocultarEnMovil: true,
  },
  {
    id: "valor",
    titulo: "Valor",
    celda: (d) => moneda(d.ValorTotal),
    alineacion: "derecha",
    className: "text-xs tabular-nums whitespace-nowrap",
  },
  {
    id: "registradoPor",
    titulo: "Registrado por",
    celda: (d) => d.RegistradoPor ?? "—",
    className: "text-xs",
    ocultarEnMovil: true,
  },
  {
    id: "situacion",
    titulo: "Situación",
    celda: (d) => <CeldaSituacion documento={d} />,
  },
];

function CeldaSituacion({ documento: d }: { documento: DocumentoHistorial }) {
  if (d.Situacion === "anulado") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="destructive" className="w-fit">
          Anulado
        </Badge>
        {d.FechaAnulacion && (
          <span className="text-[11px] text-muted-foreground">
            {d.AnuladoPor ?? "—"} · {fechaHora(d.FechaAnulacion)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="success">Confirmado</Badge>
      {!d.PuedeCorregir && d.MotivoBloqueo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground" aria-label={`No corregible: ${d.MotivoBloqueo}`}>
              <Lock className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{d.MotivoBloqueo}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function HistorialDocumentosPage() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const q = useDebounce(filtros.busqueda.trim(), 350);
  const registradoPor = useDebounce(filtros.registradoPor.trim(), 350);

  /* Todo cambio de filtro vuelve a la página 1: si no, la página 5 de un
     resultado más chico queda vacía. */
  const setFiltro = <K extends keyof typeof FILTROS_VACIOS>(
    clave: K,
    valor: (typeof FILTROS_VACIOS)[K],
  ) => {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    setPagina(1);
  };

  const hayFiltro = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);

  const { data, isLoading, isError, isFetching, refetch } = useHistorialDocumentos({
    desde: filtros.desde,
    hasta: filtros.hasta,
    tipo: filtros.tipo,
    situacion: filtros.situacion,
    q,
    registradoPor,
    idProducto: filtros.idProducto,
    pagina,
  });
  const { data: productos } = useSaldos();

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const desde = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const hasta = Math.min(pagina * limit, total);

  /* Acciones: detalle, corregir y anular (los diálogos son los de Movimientos). */
  const [verId, setVerId] = useState<string | null>(null);
  const [corregirId, setCorregirId] = useState<string | null>(null);
  const [anular, setAnular] = useState<DocumentoHistorial | null>(null);
  const { data: detalleCorregir, isError: errorCorregir } = useDocumentoDetalle(corregirId);

  useEffect(() => {
    if (!errorCorregir) return;
    toast.error("No se pudo abrir la corrección del documento.");
    setCorregirId(null);
  }, [errorCorregir]);

  const acciones = useMemo<AccionFila<DocumentoHistorial>[]>(
    () => [
      { label: "Ver detalle", icono: Eye, onClick: (d) => setVerId(d.Id) },
      {
        label: "Corregir",
        icono: Pencil,
        visible: esEditable,
        deshabilitada: (d) => !d.PuedeCorregir,
        onClick: (d) => setCorregirId(d.Id),
      },
      {
        label: "Anular",
        icono: Undo2,
        variante: "destructiva",
        visible: esEditable,
        deshabilitada: (d) => !d.PuedeCorregir,
        onClick: (d) => setAnular(d),
      },
    ],
    [],
  );

  const documentoVisto = data?.items.find((d) => d.Id === verId) ?? null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <PageHeader
          titulo="Historial de documentos"
          descripcion="Todos los documentos de inventario. Filtra para encontrar uno y corregirlo o anularlo."
        />

        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="date"
                value={filtros.desde}
                onChange={(e) => setFiltro("desde", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                value={filtros.hasta}
                onChange={(e) => setFiltro("hasta", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de documento</Label>
              <Select
                value={filtros.tipo || TODOS}
                onValueChange={(v) => setFiltro("tipo", v === TODOS ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {TIPO_DOCUMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Situación</Label>
              <Select
                value={filtros.situacion || TODOS}
                onValueChange={(v) => setFiltro("situacion", v === TODOS ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  <SelectItem value="confirmado">Confirmados</SelectItem>
                  <SelectItem value="anulado">Anulados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="busqueda">N° de documento, comprobante, referencia o notas</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busqueda"
                  value={filtros.busqueda}
                  onChange={(e) => setFiltro("busqueda", e.target.value)}
                  placeholder="Ej. 0034 o F001-2345"
                  className="pl-9"
                  inputMode="search"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="registradoPor">Registrado por</Label>
              <Input
                id="registradoPor"
                value={filtros.registradoPor}
                onChange={(e) => setFiltro("registradoPor", e.target.value)}
                placeholder="Nombre del usuario"
              />
            </div>
            <div className="space-y-1">
              <Label>Producto</Label>
              <ProductoCombobox
                productos={productos ?? []}
                value={filtros.idProducto}
                onChange={(v) => setFiltro("idProducto", v)}
                placeholder="Todos"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Cargando documentos..."
              : `${total} ${total === 1 ? "documento" : "documentos"}${hayFiltro ? " con estos filtros" : ""}`}
            {isFetching && !isLoading && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />
            )}
          </p>
          {hayFiltro && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiltros(FILTROS_VACIOS);
                setPagina(1);
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpiar filtros
            </Button>
          )}
        </div>

        <DataTable
          columnas={COLUMNAS}
          datos={data?.items}
          obtenerId={(d) => d.Id}
          cargando={isLoading}
          error={isError}
          onReintentar={() => void refetch()}
          acciones={acciones}
          tamañoPagina={0}
          anchoMinimo={900}
          vacio={{
            icono: FileText,
            titulo: hayFiltro ? "Ningún documento coincide" : "No hay documentos registrados",
            descripcion: hayFiltro ? "Prueba con otro rango de fechas o quita algún filtro." : undefined,
          }}
        />

        {total > limit && (
          <Paginacion
            pagina={pagina}
            totalPaginas={data?.totalPaginas ?? 1}
            totalItems={total}
            desde={desde}
            hasta={hasta}
            onPagina={setPagina}
          />
        )}

        <Sheet open={!!verId} onOpenChange={(open) => !open && setVerId(null)}>
          <SheetContent side="panel">
            <SheetHeader className="text-left">
              <SheetTitle>
                Documento {documentoVisto?.NumeroDocumento ?? ""}
              </SheetTitle>
              <SheetDescription className="sr-only">Detalle del documento</SheetDescription>
            </SheetHeader>
            {documentoVisto && (
              <DetalleDocumento documento={documentoVisto} productos={productos ?? []} />
            )}
          </SheetContent>
        </Sheet>

        {corregirId && detalleCorregir && detalleCorregir.Id === corregirId && (
          <DialogCorregirDocumento documento={detalleCorregir} onClose={() => setCorregirId(null)} />
        )}
        {anular && <DialogAnularDocumento documento={anular} onClose={() => setAnular(null)} />}
      </div>
    </TooltipProvider>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function DetalleDocumento({
  documento: d,
  productos,
}: {
  documento: DocumentoHistorial;
  productos: { IdProducto: string; Sku: string; NombreProducto: string }[];
}) {
  const { data: detalle, isLoading } = useDocumentoDetalle(d.Id);
  const nombre = (id: string) => {
    const p = productos.find((x) => x.IdProducto === id);
    return p ? `${p.Sku} · ${p.NombreProducto}` : id;
  };

  return (
    <div className="space-y-5 overflow-y-auto px-4 pb-6">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dato label="Tipo">{TIPO_LABEL[d.TipoDocumento] ?? d.TipoDocumento}</Dato>
        <Dato label="Fecha del documento">{fechaCorta(d.FechaDocumento)}</Dato>
        <Dato label="Registrado por">{d.RegistradoPor ?? "—"}</Dato>
        <Dato label="Registrado el">{fechaHora(d.FechaRegistro)}</Dato>
        <Dato label="Movimiento">{descripcionMovimiento(d)}</Dato>
        <Dato label="Valor total">{moneda(d.ValorTotal)}</Dato>
        <Dato label="Comprobante">{d.Comprobante ?? "—"}</Dato>
        <Dato label="Referencia">{d.Referencia ?? "—"}</Dato>
        {d.Situacion === "anulado" && (
          <Dato label="Anulado">
            {d.AnuladoPor ?? "—"}
            {d.FechaAnulacion ? ` · ${fechaHora(d.FechaAnulacion)}` : ""}
          </Dato>
        )}
      </dl>

      {d.Notas && <Dato label="Notas">{d.Notas}</Dato>}

      {d.Situacion === "confirmado" && !d.PuedeCorregir && d.MotivoBloqueo && (
        <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            <strong>No se puede corregir ni anular desde aquí.</strong> {d.MotivoBloqueo}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Productos ({d.CantidadItems})</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando líneas...</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {(detalle?.Detalle ?? []).map((l, i) => (
              <li key={`${l.IdProducto}-${i}`} className="flex items-start justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">{nombre(l.IdProducto)}</span>
                <span className="shrink-0 text-right tabular-nums">
                  {l.Cantidad}
                  {l.CostoUnitario !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {moneda(l.CostoUnitario)} c/u
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
