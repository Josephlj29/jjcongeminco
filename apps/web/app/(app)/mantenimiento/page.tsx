"use client";

/**
 * app/(app)/mantenimiento/page.tsx — Órdenes de Trabajo de Mantenimiento (OT)
 *
 * Ciclo de vida de una orden, que es lo que ordena toda esta pantalla:
 *
 *   alta      → "Abierta": en curso. Se edita cuanto haga falta (cabecera, tareas
 *               y repuestos, que se guardan como BORRADOR sin tocar el kardex).
 *   culminar  → "Por aprobar" si tiene repuestos; "Cerrada" si no tiene, porque
 *               entonces no hay descuento de stock que aprobar.
 *   aprobar   → "Cerrada", y recién ahí se descuenta el stock.
 *   rechazar  → "Anulada". El aprobador también puede devolverla a "Abierta" si
 *               solo está incompleta, que no es lo mismo que rechazarla.
 *
 * Pestañas por situación. Acciones por fila en kebab.
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
  Undo2,
} from "lucide-react";
import { type OrdenMantenimientoResumen, type SituacionOrden } from "@congeminco/shared";
import {
  useOrdenesMantenimiento,
  useOrdenMantenimientoDetalle,
  useEliminarOrdenMantenimiento,
  useFinalizarOrden,
  useReabrirOrden,
} from "@/hooks/useOrdenesMantenimiento";
import { DialogOrdenMantenimiento } from "@/components/mantenimiento/DialogOrdenMantenimiento";
import { DialogDetalleOrden } from "@/components/mantenimiento/DialogDetalleOrden";
import { DialogReconciliarOrden } from "@/components/mantenimiento/DialogReconciliarOrden";
import { DialogCulminarOrden } from "@/components/mantenimiento/DialogCulminarOrden";
import { DialogDevolverAbierta } from "@/components/mantenimiento/DialogDevolverAbierta";
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
  onCulminar: (o: OrdenMantenimientoResumen) => void;
  onDevolverAbierta: (o: OrdenMantenimientoResumen) => void;
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
            <DropdownMenuItem onClick={() => handlers.onCulminar(o)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Culminar
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
            {/* Devolver a abierta: la saca de la bandeja sin juzgarla, a diferencia
                de rechazar, que la anula. No aplica si ya descontó stock. */}
            {puedeAprobar && !o.StockDescontado && (
              <DropdownMenuItem onClick={() => handlers.onDevolverAbierta(o)}>
                <Undo2 className="mr-2 h-4 w-4" />
                Devolver a abierta
              </DropdownMenuItem>
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

  // Toda OT nueva nace "Abierta" (en curso): esa es la pestaña donde el usuario
  // busca lo que acaba de registrar y lo que le falta culminar.
  const [tab, setTab] = useState<SituacionOrden>("abierta");
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
  const [culminar, setCulminar] = useState<OrdenMantenimientoResumen | null>(null);
  const [devolver, setDevolver] = useState<OrdenMantenimientoResumen | null>(null);

  const { data: detalleEditar } = useOrdenMantenimientoDetalle(editarId);
  const { mutateAsync: borrar } = useEliminarOrdenMantenimiento();
  const { mutateAsync: finalizar, isPending: finalizando } = useFinalizarOrden();
  const { mutateAsync: reabrir, isPending: reabriendo } = useReabrirOrden();

  /* Culminar: el destino lo decide la BD según los repuestos, así que el aviso se
     arma con la situación que devuelve y además se salta a esa pestaña, para que
     la orden no "desaparezca" de la vista. */
  const culminarOrden = async (o: OrdenMantenimientoResumen) => {
    try {
      const { Situacion } = await finalizar({ id: o.Id, anular: false });
      setCulminar(null);
      if (Situacion === "consumida") {
        toast.success("Orden culminada. Queda por aprobar: el stock se descuenta al aprobarla.");
        setTab("consumida");
      } else {
        toast.success("Orden culminada y cerrada. No hubo movimientos de stock.");
        setTab("cerrada");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const cancelarOrden = async (id: string) => {
    try {
      await finalizar({ id, anular: true });
      toast.success("Orden cancelada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const devolverAbierta = async (o: OrdenMantenimientoResumen, motivo: string) => {
    try {
      await reabrir({ id: o.Id, motivo: motivo || undefined });
      setDevolver(null);
      toast.success("Orden devuelta a abierta. Ya se puede editar.");
      setTab("abierta");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlers: AccionesHandlers = {
    puedeEscribir,
    puedeAprobar,
    onDetalle: setDetalleId,
    onEditar: setEditarId,
    // Culminar confirma primero: el destino depende de si hay repuestos.
    onCulminar: setCulminar,
    onDevolverAbierta: setDevolver,
    onCancelar: (id) => void cancelarOrden(id),
    onReconciliar: setReconciliar,
    onEliminar: setEliminar,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Mantenimiento"
        descripcion="Órdenes de trabajo por placa, con fotos por tarea. Nacen abiertas y se editan cuanto haga falta; al culminarlas pasan a aprobación si llevan repuestos, o se cierran si no. El stock se descuenta al aprobar."
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
          <TabsTrigger value="abierta">Abiertas</TabsTrigger>
          <TabsTrigger value="consumida">Por aprobar</TabsTrigger>
          <TabsTrigger value="cerrada">Cerradas</TabsTrigger>
          <TabsTrigger value="anulada">Anuladas</TabsTrigger>
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
                        <TableCell className="text-xs">{fechaCorta(o.FechaOrden)}</TableCell>
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

      {culminar && (
        <DialogCulminarOrden
          numeroOrden={culminar.NumeroOrden}
          tieneRepuestos={culminar.TieneRepuestos}
          procesando={finalizando}
          onConfirmar={() => void culminarOrden(culminar)}
          onCancelar={() => setCulminar(null)}
        />
      )}

      {devolver && (
        <DialogDevolverAbierta
          numeroOrden={devolver.NumeroOrden}
          procesando={reabriendo}
          onConfirmar={(motivo) => void devolverAbierta(devolver, motivo)}
          onCancelar={() => setDevolver(null)}
        />
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
