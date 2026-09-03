"use client";

/**
 * app/(app)/mantenimiento/page.tsx — Órdenes de Trabajo de Mantenimiento (OT)
 *
 * La OT se registra al TERMINAR el trabajo, en un solo paso: tareas con foto
 * opcional de antes/después y repuestos usados como BORRADOR. Toda orden nueva
 * nace "Por aprobar" (con o sin repuestos) y mientras está ahí se sigue editando
 * (cabecera, tareas y repuestos); al aprobar se descuenta el stock y se cierra.
 * Las OTs "Abiertas" son legado (ya no nacen así) y conservan sus acciones hasta
 * que se procesen. Pestañas por situación. Acciones por fila en kebab.
 *
 * Responsive: el mismo dato se presenta como tarjetas apiladas en móvil
 * (`md:hidden`) y como tabla densa en desktop (`hidden md:block`). El menú de
 * acciones (`AccionesOrden`) se comparte entre ambas presentaciones.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Eye,
  FileText,
  Pencil,
  CheckCircle2,
  Ban,
  Trash2,
  Hammer,
  ClipboardCheck,
} from "lucide-react";
import { type OrdenMantenimientoResumen, type SituacionOrden } from "@congeminco/shared";
import {
  useOrdenesMantenimiento,
  useOrdenMantenimientoDetalle,
  useEliminarOrdenMantenimiento,
  useFinalizarOrden,
} from "@/hooks/useOrdenesMantenimiento";
import { DialogOrdenMantenimiento } from "@/components/mantenimiento/DialogOrdenMantenimiento";
import { DialogDetalleOrden } from "@/components/mantenimiento/DialogDetalleOrden";
import { DialogReconciliarOrden } from "@/components/mantenimiento/DialogReconciliarOrden";
import { DialogEliminar } from "@/components/DialogEliminar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/PageHeader";
import { usePermiso } from "@/hooks/useYo";
import { imprimirOrdenMantenimiento } from "@/lib/imprimir-orden-mantenimiento";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { fechaCorta } from "@/lib/format";

const TIPO_LABEL: Record<string, string> = { preventivo: "Preventivo", correctivo: "Correctivo" };
const TURNO_LABEL: Record<string, string> = { dia: "Día", tarde: "Tarde", noche: "Noche" };
const SIT_LABEL: Record<SituacionOrden, string> = {
  abierta: "Abierta",
  consumida: "Por aprobar",
  cerrada: "Cerrada",
  anulada: "Anulada",
};
const SIT_VARIANTE: Record<SituacionOrden, "default" | "secondary" | "success" | "destructive"> = {
  abierta: "secondary",
  consumida: "default",
  cerrada: "success",
  anulada: "destructive",
};

async function pdf(id: string) {
  try {
    await imprimirOrdenMantenimiento(id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function nombreOrden(o: OrdenMantenimientoResumen): string {
  return o.NumeroOrden ?? o.Id.slice(0, 8);
}

function personalTexto(o: OrdenMantenimientoResumen): string {
  return o.Personales.length ? o.Personales.map((p) => p.NombreCompleto ?? "—").join(", ") : "—";
}

/* ── Handlers compartidos por tarjeta (móvil) y fila (desktop) ── */
interface AccionesHandlers {
  puedeEscribir: boolean;
  puedeAprobar: boolean;
  onDetalle: (id: string) => void;
  onEditar: (id: string) => void;
  onCulminar: (id: string) => void;
  onCancelar: (id: string) => void;
  onReconciliar: (id: string) => void;
  onEliminar: (v: { id: string; nombre: string }) => void;
}

/* Menú kebab de acciones — idéntico en móvil y desktop. */
function AccionesOrden({
  orden: o,
  handlers,
}: {
  orden: OrdenMantenimientoResumen;
  handlers: AccionesHandlers;
}) {
  const { puedeEscribir, puedeAprobar } = handlers;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => handlers.onDetalle(o.Id)}>
          <Eye className="mr-2 h-4 w-4" />
          Ver detalle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void pdf(o.Id)}>
          <FileText className="mr-2 h-4 w-4" />
          Imprimir PDF
        </DropdownMenuItem>

        {puedeEscribir && o.Situacion === "abierta" && (
          <>
            <DropdownMenuSeparator />
            {/* El consumo de una OT abierta se hace desde "Editar" (bloque de
                repuestos del formulario); no hay acción separada. */}
            <DropdownMenuItem onClick={() => handlers.onEditar(o.Id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlers.onCulminar(o.Id)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Culminar (sin repuestos)
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handlers.onCancelar(o.Id)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancelar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handlers.onEliminar({ id: o.Id, nombre: nombreOrden(o) })}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
        {o.Situacion === "consumida" && (
          <>
            <DropdownMenuSeparator />
            {/* Hasta aprobar, la OT es un borrador (cabecera, tareas y repuestos)
                que se corrige o elimina desde acá; con el stock ya descontado
                (legado) no se toca. */}
            {puedeEscribir && !o.StockDescontado && (
              <>
                <DropdownMenuItem onClick={() => handlers.onEditar(o.Id)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handlers.onEliminar({ id: o.Id, nombre: nombreOrden(o) })}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
            {puedeAprobar ? (
              <DropdownMenuItem onClick={() => handlers.onReconciliar(o.Id)}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Revisar y aprobar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>Pendiente de aprobación</DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Tarjeta (móvil) ──
   Tap en el cuerpo → detalle. El kebab (esquina) maneja el resto de acciones y
   detiene la propagación para no disparar el detalle. */
function TarjetaOrden({
  orden: o,
  handlers,
}: {
  orden: OrdenMantenimientoResumen;
  handlers: AccionesHandlers;
}) {
  return (
    <Card className="relative flex flex-col gap-2 p-3">
      <button
        type="button"
        onClick={() => handlers.onDetalle(o.Id)}
        className="flex flex-col gap-2 pr-12 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{nombreOrden(o)}</span>
          <Badge variant={SIT_VARIANTE[o.Situacion]} className="shrink-0">
            {SIT_LABEL[o.Situacion]}
          </Badge>
        </div>
        <p className="text-lg font-bold leading-none">{o.Placa ?? "—"}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{fechaCorta(o.FechaOrden)}</span>
          <span>· {TIPO_LABEL[o.TipoMantenimiento]}</span>
          <span>· {TURNO_LABEL[o.Turno] ?? o.Turno}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">👷 {personalTexto(o)}</p>
      </button>
      <div className="absolute right-1.5 top-1.5">
        <AccionesOrden orden={o} handlers={handlers} />
      </div>
    </Card>
  );
}

export default function MantenimientoPage() {
  const puedeEscribir = usePermiso("requerimientoCrear");
  const puedeAprobar = usePermiso("requerimientoAprobar");

  // Toda OT nueva nace "Por aprobar": la pestaña inicial es la bandeja de
  // aprobación, no el legado "Abiertas".
  const [tab, setTab] = useState<SituacionOrden>("consumida");
  const {
    data: ordenes,
    isLoading,
    isError: errorOrdenes,
    refetch,
  } = useOrdenesMantenimiento({ situacion: tab });

  const [crear, setCrear] = useState(false);
  const [editarId, setEditarId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [reconciliar, setReconciliar] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<{ id: string; nombre: string } | null>(null);

  const { data: detalleEditar } = useOrdenMantenimientoDetalle(editarId);
  const { mutateAsync: borrar } = useEliminarOrdenMantenimiento();
  const { mutateAsync: finalizar } = useFinalizarOrden();

  const finalizarOrden = async (id: string, anular: boolean) => {
    try {
      await finalizar({ id, anular });
      toast.success(anular ? "Orden cancelada" : "Orden cerrada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlers: AccionesHandlers = {
    puedeEscribir,
    puedeAprobar,
    onDetalle: setDetalleId,
    onEditar: setEditarId,
    // Cierre directo de una OT abierta legada: ya no hay diálogo de fotos (la
    // evidencia es por tarea y opcional).
    onCulminar: (id) => void finalizarOrden(id, false),
    onCancelar: (id) => void finalizarOrden(id, true),
    onReconciliar: setReconciliar,
    onEliminar: setEliminar,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Mantenimiento"
        descripcion="Órdenes de trabajo por placa. Se registran al terminar el trabajo, con fotos por tarea, y quedan pendientes de aprobación; el stock de los repuestos se descuenta al aprobar."
        acciones={
          puedeEscribir && (
            <Button onClick={() => setCrear(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nueva orden
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as SituacionOrden)} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="consumida">Por aprobar</TabsTrigger>
          <TabsTrigger value="cerrada">Cerradas</TabsTrigger>
          <TabsTrigger value="anulada">Anuladas</TabsTrigger>
          <TabsTrigger value="abierta">Abiertas</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 md:h-12" />
              ))}
            </div>
          ) : errorOrdenes ? (
            <ErrorState onReintentar={() => void refetch()} />
          ) : !ordenes?.length ? (
            <EmptyState
              icon={Hammer}
              titulo="Sin órdenes"
              descripcion={`No hay órdenes ${SIT_LABEL[tab].toLowerCase()}.`}
              accion={
                puedeEscribir ? (
                  <Button size="sm" onClick={() => setCrear(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva orden
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Móvil: tarjetas apiladas */}
              <div className="space-y-3 md:hidden">
                {ordenes.map((o) => (
                  <TarjetaOrden key={o.Id} orden={o} handlers={handlers} />
                ))}
              </div>

              {/* Desktop: tabla densa */}
              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>N° OT</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Personal</TableHead>
                      <TableHead>Situación</TableHead>
                      <TableHead className="w-10 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenes.map((o) => (
                      <TableRow key={o.Id}>
                        <TableCell className="text-xs">
                          {fechaCorta(o.FechaOrden)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{nombreOrden(o)}</TableCell>
                        <TableCell className="text-sm font-medium">{o.Placa ?? "—"}</TableCell>
                        <TableCell className="text-xs">{TIPO_LABEL[o.TipoMantenimiento]}</TableCell>
                        <TableCell className="text-xs">{TURNO_LABEL[o.Turno] ?? o.Turno}</TableCell>
                        <TableCell className="text-xs">{personalTexto(o)}</TableCell>
                        <TableCell>
                          <Badge variant={SIT_VARIANTE[o.Situacion]}>
                            {SIT_LABEL[o.Situacion]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <AccionesOrden orden={o} handlers={handlers} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {crear && (
        <DialogOrdenMantenimiento
          orden={null}
          onClose={() => setCrear(false)}
          // La orden nueva aparece en la pestaña donde cayó (por aprobar).
          onGuardada={setTab}
        />
      )}

      {editarId && detalleEditar && detalleEditar.Id === editarId && (
        <DialogOrdenMantenimiento
          orden={detalleEditar}
          onClose={() => setEditarId(null)}
          onGuardada={setTab}
        />
      )}

      {detalleId && <DialogDetalleOrden idOrden={detalleId} onClose={() => setDetalleId(null)} />}

      {reconciliar && (
        <DialogReconciliarOrden idOrden={reconciliar} onClose={() => setReconciliar(null)} />
      )}

      <DialogEliminar
        entidad="ordenMantenimiento"
        id={eliminar?.id ?? null}
        nombre={eliminar?.nombre ?? ""}
        open={!!eliminar}
        onOpenChange={(v) => {
          if (!v) setEliminar(null);
        }}
        onConfirmar={async () => {
          if (!eliminar) return;
          try {
            await borrar(eliminar.id);
            toast.success("Orden eliminada");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}
