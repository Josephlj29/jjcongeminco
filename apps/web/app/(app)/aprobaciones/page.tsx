"use client";

/**
 * app/(app)/aprobaciones/page.tsx — Panel de aprobaciones de requerimientos
 *
 * Separación de funciones: aquí gestionan los requerimientos PENDIENTES los
 * roles aprobadores (gerencia/supervisión/admin), que NO son necesariamente
 * quienes los crearon. Aprobar genera la salida (parcial y/o compra directa);
 * rechazar los anula. El guard "creador ≠ aprobador" lo refuerza la BD.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { puede, type RoleCode } from "@congeminco/shared";
import { useRequerimientos } from "@/hooks/useRequerimientos";
import { DialogAprobarRequerimiento } from "@/components/requerimientos/DialogAprobarRequerimiento";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function AprobacionesPage() {
  const { data: yo } = useRolActual();
  const puedeAprobar = puede(yo?.rol ?? null, "requerimientoAprobar");
  const { data: pendientes, isLoading } = useRequerimientos({
    situacion: "pendiente",
  });
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aprobaciones</h1>
        <p className="text-muted-foreground">
          Revisa los requerimientos pendientes: aprueba (genera la salida
          valorizada) o rechaza.
        </p>
      </div>

      {yo && !puedeAprobar ? (
        <EmptyState
          icon={ClipboardCheck}
          titulo="Sin acceso"
          descripcion="Tu rol no puede gestionar aprobaciones de requerimientos."
        />
      ) : isLoading ? (
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
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogAprobarRequerimiento
        idRequerimiento={seleccionado}
        puedeAprobar={puedeAprobar}
        onClose={() => setSeleccionado(null)}
      />
    </div>
  );
}
