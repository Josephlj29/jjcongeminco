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
 *
 * Las órdenes de trabajo de mantenimiento se aprueban en su propio módulo
 * (Mantenimiento → pestaña "Por aprobar"), no aquí.
 */
import { useState } from "react";
import { ChevronRight, ClipboardCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { ORIGEN_REQUERIMIENTO_LABEL } from "@congeminco/shared";
import { useRequerimientos, type RequerimientoResumen } from "@/hooks/useRequerimientos";
import { useYo, usePermiso } from "@/hooks/useYo";
import { DialogAprobarRequerimiento } from "@/components/requerimientos/DialogAprobarRequerimiento";
import { imprimirSolicitudRequerimiento } from "@/lib/imprimir-solicitud";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/PageHeader";
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

const SITUACION_VARIANTE = {
  pendiente: "default" as const,
  parcial: "warning" as const,
  atendido: "success" as const,
  anulado: "destructive" as const,
};

const SITUACION_LABEL: Record<string, string> = {
  pendiente: "pendiente · revisar",
  parcial: "parcial · re-atender",
  atendido: "atendido",
  anulado: "anulado",
};

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
      <FileText className="mr-1 h-3.5 w-3.5" />
      {generando ? "..." : "PDF"}
    </Button>
  );
}

export default function AprobacionesPage() {
  const { data: yo } = useYo();
  const puedeAprobar = usePermiso("requerimientoAprobar");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const {
    data: pendientes,
    isLoading: cargandoPend,
    isError: errorPend,
    refetch: refetchPend,
  } = useRequerimientos({
    situacion: "pendiente",
  });
  const {
    data: parciales,
    isLoading: cargParc,
    isError: errParc,
    refetch: refetchParc,
  } = useRequerimientos({
    situacion: "parcial",
  });
  const {
    data: atendidos,
    isLoading: cargAt,
    isError: errAt,
    refetch: refetchAt,
  } = useRequerimientos({
    situacion: "atendido",
  });
  const {
    data: anulados,
    isLoading: cargAn,
    isError: errAn,
    refetch: refetchAn,
  } = useRequerimientos({
    situacion: "anulado",
  });

  const cargandoHist = cargAt || cargAn;
  const errorHist = errAt || errAn;
  const historico: RequerimientoResumen[] = [...(atendidos ?? []), ...(anulados ?? [])].sort(
    (a, b) => b.FechaRequerimiento.localeCompare(a.FechaRequerimiento),
  );

  // "Por atender" = pendientes + parciales (ambos admiten (re-)atención).
  const cargandoPorAtender = cargandoPend || cargParc;
  const errorPorAtender = errorPend || errParc;
  const porAtender: RequerimientoResumen[] = [...(pendientes ?? []), ...(parciales ?? [])].sort(
    (a, b) => b.FechaRequerimiento.localeCompare(a.FechaRequerimiento),
  );
  const reintentarPorAtender = () => {
    void refetchPend();
    void refetchParc();
  };

  if (yo && !puedeAprobar) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Aprobaciones" />
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
      <PageHeader
        titulo="Aprobaciones"
        descripcion="Revisa los requerimientos pendientes (aprueba o rechaza) y consulta el histórico. Genera el PDF de cada solicitud para gestión o impresión."
      />

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">
            Por atender{porAtender.length ? ` (${porAtender.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ─── Por atender (pendientes + parciales) ─── */}
        <TabsContent value="pendientes">
          {cargandoPorAtender ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : errorPorAtender ? (
            <ErrorState onReintentar={reintentarPorAtender} />
          ) : !porAtender.length ? (
            <EmptyState
              icon={ClipboardCheck}
              titulo="Todo al día"
              descripcion="No hay requerimientos pendientes ni parciales por atender."
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
                  {porAtender.map((r) => (
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
                        {ORIGEN_REQUERIMIENTO_LABEL[r.Origen] ?? r.Origen}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SITUACION_VARIANTE[r.Situacion] ?? "default"}>
                          {SITUACION_LABEL[r.Situacion] ?? r.Situacion}
                        </Badge>
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

        {/* ─── Histórico ─── */}
        <TabsContent value="historico">
          {cargandoHist ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : errorHist ? (
            <ErrorState
              onReintentar={() => {
                void refetchAt();
                void refetchAn();
              }}
            />
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
                        {ORIGEN_REQUERIMIENTO_LABEL[r.Origen] ?? r.Origen}
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
    </div>
  );
}
