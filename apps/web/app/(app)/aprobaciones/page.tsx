"use client";

/**
 * app/(app)/aprobaciones/page.tsx — Panel de aprobaciones de requerimientos
 *
 * Dos pestañas:
 *  - Pendientes: requerimientos por aprobar (click en la fila abre la bandeja).
 *  - Histórico: atendidos + anulados (solo lectura).
 * Cada fila tiene un botón "PDF" que genera el documento de la solicitud
 * (imprimir o guardar como PDF). Separación de funciones: aprueban los roles
 * aprobadores (gerencia/supervisión/admin); el guard creador≠aprobador lo
 * refuerza la BD.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { puede, type RoleCode } from "@congeminco/shared";
import { useRequerimientos, type RequerimientoResumen } from "@/hooks/useRequerimientos";
import { useOrdenesMantenimiento } from "@/hooks/useOrdenesMantenimiento";
import { DialogAprobarRequerimiento } from "@/components/requerimientos/DialogAprobarRequerimiento";
import { DialogReconciliarOrden } from "@/components/mantenimiento/DialogReconciliarOrden";
import { imprimirSolicitudRequerimiento } from "@/lib/imprimir-solicitud";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const ORIGEN_LABEL: Record<string, string> = {
  planificado: "Planificado",
  presupuestado: "Presupuestado",
  desgaste_prematuro: "Desgaste prematuro",
};

const SITUACION_VARIANTE = {
  pendiente: "default" as const,
  atendido: "success" as const,
  anulado: "destructive" as const,
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

function BotonPdf({ id }: { id: string }) {
  const [generando, setGenerando] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={generando}
      onClick={async (e) => {
        e.stopPropagation();
        setGenerando(true);
        try {
          await imprimirSolicitudRequerimiento(id);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setGenerando(false);
        }
      }}
    >
      <FileText className="h-3.5 w-3.5 mr-1" />
      {generando ? "..." : "PDF"}
    </Button>
  );
}

export default function AprobacionesPage() {
  const { data: yo } = useRolActual();
  const puedeAprobar = puede(yo?.rol ?? null, "requerimientoAprobar");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [ordenReconciliar, setOrdenReconciliar] = useState<string | null>(null);

  const { data: ordenesConsumidas, isLoading: cargandoOrdenes } = useOrdenesMantenimiento({
    situacion: "consumida",
  });

  const { data: pendientes, isLoading: cargandoPend } = useRequerimientos({
    situacion: "pendiente",
  });
  const { data: atendidos, isLoading: cargAt } = useRequerimientos({
    situacion: "atendido",
  });
  const { data: anulados, isLoading: cargAn } = useRequerimientos({
    situacion: "anulado",
  });

  const cargandoHist = cargAt || cargAn;
  const historico: RequerimientoResumen[] = [
    ...(atendidos ?? []),
    ...(anulados ?? []),
  ].sort((a, b) => b.FechaRequerimiento.localeCompare(a.FechaRequerimiento));

  if (yo && !puedeAprobar) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aprobaciones</h1>
        </div>
        <EmptyState
          icon={ClipboardCheck}
          titulo="Sin acceso"
          descripcion="Tu rol no puede gestionar aprobaciones de requerimientos."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aprobaciones</h1>
        <p className="text-muted-foreground">
          Revisa los requerimientos pendientes (aprueba o rechaza) y consulta el
          histórico. Genera el PDF de cada solicitud para gestión o impresión.
        </p>
      </div>

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes{pendientes?.length ? ` (${pendientes.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="mantenimiento">
            Mantenimiento{ordenesConsumidas?.length ? ` (${ordenesConsumidas.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ─── Pendientes ─── */}
        <TabsContent value="pendientes">
          {cargandoPend ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !pendientes?.length ? (
            <EmptyState
              icon={ClipboardCheck}
              titulo="Todo al día"
              descripcion="No hay requerimientos pendientes de aprobación."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>N° Req.</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Situación</TableHead>
                    <TableHead className="text-right">Documento</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.map((r) => (
                    <TableRow
                      key={r.Id}
                      className="cursor-pointer"
                      onClick={() => setSeleccionado(r.Id)}
                    >
                      <TableCell className="text-xs">
                        {new Date(r.FechaRequerimiento).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.NumeroRequerimiento ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ORIGEN_LABEL[r.Origen] ?? r.Origen}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">pendiente · revisar</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <BotonPdf id={r.Id} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ─── Mantenimiento (consumos por aprobar) ─── */}
        <TabsContent value="mantenimiento">
          {cargandoOrdenes ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !ordenesConsumidas?.length ? (
            <EmptyState
              icon={ClipboardCheck}
              titulo="Sin consumos por aprobar"
              descripcion="No hay órdenes de mantenimiento que hayan consumido repuestos a la espera de ratificación."
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
                    <TableHead>Mecánico</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenesConsumidas.map((o) => (
                    <TableRow
                      key={o.Id}
                      className="cursor-pointer"
                      onClick={() => setOrdenReconciliar(o.Id)}
                    >
                      <TableCell className="text-xs">
                        {new Date(o.FechaOrden).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.NumeroOrden ?? o.Id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">{o.Placa ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {o.TipoMantenimiento === "correctivo" ? "Correctivo" : "Preventivo"}
                      </TableCell>
                      <TableCell className="text-xs">{o.NombreMecanico ?? "—"}</TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ─── Histórico ─── */}
        <TabsContent value="historico">
          {cargandoHist ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !historico.length ? (
            <EmptyState
              icon={ClipboardCheck}
              titulo="Sin histórico"
              descripcion="Todavía no hay requerimientos atendidos ni anulados."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>N° Req.</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Situación</TableHead>
                    <TableHead className="text-right">Documento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((r) => (
                    <TableRow key={r.Id}>
                      <TableCell className="text-xs">
                        {new Date(r.FechaRequerimiento).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.NumeroRequerimiento ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ORIGEN_LABEL[r.Origen] ?? r.Origen}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SITUACION_VARIANTE[r.Situacion] ?? "default"}>
                          {r.Situacion}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <BotonPdf id={r.Id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DialogAprobarRequerimiento
        idRequerimiento={seleccionado}
        puedeAprobar={puedeAprobar}
        onClose={() => setSeleccionado(null)}
      />

      {ordenReconciliar && (
        <DialogReconciliarOrden
          idOrden={ordenReconciliar}
          onClose={() => setOrdenReconciliar(null)}
        />
      )}
    </div>
  );
}
