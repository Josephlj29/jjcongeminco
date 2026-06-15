"use client";

/**
 * app/(app)/mantenimiento/page.tsx — Órdenes de Trabajo de Mantenimiento (OT)
 *
 * Flujo consumir→reconciliar (Model 2): se crea la OT, se registran los repuestos
 * usados (descuenta stock al instante), y el admin reconcilia en Aprobaciones.
 * Pestañas por situación. Acciones por fila en menú kebab.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Eye,
  FileText,
  PackageMinus,
  Pencil,
  CheckCircle2,
  Ban,
  Trash2,
  Hammer,
} from "lucide-react";
import { puede, type RoleCode, type SituacionOrden } from "@congeminco/shared";
import {
  useOrdenesMantenimiento,
  useOrdenMantenimientoDetalle,
  useEliminarOrdenMantenimiento,
  useFinalizarOrden,
} from "@/hooks/useOrdenesMantenimiento";
import { DialogOrdenMantenimiento } from "@/components/mantenimiento/DialogOrdenMantenimiento";
import { DialogConsumirRepuestos } from "@/components/mantenimiento/DialogConsumirRepuestos";
import { DialogDetalleOrden } from "@/components/mantenimiento/DialogDetalleOrden";
import { DialogEliminar } from "@/components/DialogEliminar";
import { EmptyState } from "@/components/EmptyState";
import { imprimirOrdenMantenimiento } from "@/lib/imprimir-orden-mantenimiento";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function useRolActual() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error("Sin sesión");
      return res.json() as Promise<{ rol: RoleCode }>;
    },
  });
}

async function pdf(id: string) {
  try {
    await imprimirOrdenMantenimiento(id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export default function MantenimientoPage() {
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "requerimientoCrear");

  const [tab, setTab] = useState<SituacionOrden>("abierta");
  const { data: ordenes, isLoading } = useOrdenesMantenimiento({ situacion: tab });

  const [crear, setCrear] = useState(false);
  const [editarId, setEditarId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [consumir, setConsumir] = useState<{ id: string; numero: string | null } | null>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mantenimiento</h1>
          <p className="text-muted-foreground">
            Órdenes de trabajo por placa. Los repuestos se consumen del inventario y el admin los ratifica.
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={() => setCrear(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva orden
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SituacionOrden)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="abierta">Abiertas</TabsTrigger>
          <TabsTrigger value="consumida">Por aprobar</TabsTrigger>
          <TabsTrigger value="cerrada">Cerradas</TabsTrigger>
          <TabsTrigger value="anulada">Anuladas</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !ordenes?.length ? (
            <EmptyState
              icon={Hammer}
              titulo="Sin órdenes"
              descripcion={`No hay órdenes ${SIT_LABEL[tab].toLowerCase()}.`}
              accion={
                puedeEscribir && tab === "abierta" ? (
                  <Button size="sm" onClick={() => setCrear(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva orden
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>N° OT</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Mecánico</TableHead>
                    <TableHead>Situación</TableHead>
                    <TableHead className="w-10 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenes.map((o) => (
                    <TableRow key={o.Id}>
                      <TableCell className="text-xs">
                        {new Date(o.FechaOrden).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.NumeroOrden ?? o.Id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{o.Placa ?? "—"}</TableCell>
                      <TableCell className="text-xs">{TIPO_LABEL[o.TipoMantenimiento]}</TableCell>
                      <TableCell className="text-xs">{TURNO_LABEL[o.Turno] ?? o.Turno}</TableCell>
                      <TableCell className="text-xs">{o.NombreMecanico ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={SIT_VARIANTE[o.Situacion]}>{SIT_LABEL[o.Situacion]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setDetalleId(o.Id)}>
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
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConsumir({ id: o.Id, numero: o.NumeroOrden })
                                  }
                                >
                                  <PackageMinus className="mr-2 h-4 w-4" />
                                  Consumir repuestos
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditarId(o.Id)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void finalizarOrden(o.Id, false)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Cerrar (sin repuestos)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => void finalizarOrden(o.Id, true)}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Cancelar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    setEliminar({ id: o.Id, nombre: o.NumeroOrden ?? o.Id.slice(0, 8) })
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </>
                            )}
                            {o.Situacion === "consumida" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled>
                                  Reconciliar en Aprobaciones
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {crear && <DialogOrdenMantenimiento orden={null} onClose={() => setCrear(false)} />}

      {editarId && detalleEditar && detalleEditar.Id === editarId && (
        <DialogOrdenMantenimiento orden={detalleEditar} onClose={() => setEditarId(null)} />
      )}

      {detalleId && (
        <DialogDetalleOrden idOrden={detalleId} onClose={() => setDetalleId(null)} />
      )}

      {consumir && (
        <DialogConsumirRepuestos
          idOrden={consumir.id}
          numeroOrden={consumir.numero}
          onClose={() => setConsumir(null)}
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
