"use client";

/**
 * components/mantenimiento/DialogDetalleOrden.tsx
 *
 * Vista de solo lectura de una OT: cabecera, trabajos realizados y repuestos
 * consumidos (con su costo congelado del ledger).
 */
import { useOrdenMantenimientoDetalle } from "@/hooks/useOrdenesMantenimiento";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const TURNO_LABEL: Record<string, string> = { dia: "Día", tarde: "Tarde", noche: "Noche" };
const SIT_LABEL: Record<string, string> = {
  abierta: "Abierta",
  consumida: "Por aprobar",
  cerrada: "Cerrada",
  anulada: "Anulada",
};
const SIT_VARIANTE: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  abierta: "secondary",
  consumida: "default",
  cerrada: "success",
  anulada: "destructive",
};

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function DialogDetalleOrden({
  idOrden,
  onClose,
}: {
  idOrden: string;
  onClose: () => void;
}) {
  const { data: o, isLoading } = useOrdenMantenimientoDetalle(idOrden);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            OT {o?.NumeroOrden ?? idOrden.slice(0, 8)}
            {o && (
              <Badge variant={SIT_VARIANTE[o.Situacion]}>{SIT_LABEL[o.Situacion]}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !o ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Placa: </span>
                {o.Placa ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Tipo: </span>
                {o.TipoMantenimiento === "correctivo" ? "Correctivo" : "Preventivo"}
              </div>
              <div>
                <span className="text-muted-foreground">Fecha: </span>
                {new Date(o.FechaOrden).toLocaleDateString("es-PE")}
              </div>
              <div>
                <span className="text-muted-foreground">Turno: </span>
                {TURNO_LABEL[o.Turno] ?? o.Turno}
              </div>
              <div>
                <span className="text-muted-foreground">Kilometraje: </span>
                {o.Kilometraje !== null ? o.Kilometraje : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Mecánico: </span>
                {o.NombreMecanico ?? "—"}
                {o.CargoMecanico ? ` · ${o.CargoMecanico}` : ""}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-1">Trabajos realizados</h3>
              {o.Trabajos.length ? (
                <ol className="list-decimal pl-5 text-sm space-y-0.5">
                  {o.Trabajos.map((t) => (
                    <li key={t.Id}>{t.Descripcion}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Sin trabajos registrados.</p>
              )}
            </div>

            {o.Observaciones && (
              <div>
                <h3 className="text-sm font-medium mb-1">Observaciones</h3>
                <p className="text-sm text-muted-foreground">{o.Observaciones}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium mb-1">Repuestos consumidos</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-center w-20">Cant.</TableHead>
                      <TableHead className="text-center w-16">U.M</TableHead>
                      <TableHead className="text-right w-28">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.Repuestos.length ? (
                      o.Repuestos.map((r) => (
                        <TableRow key={r.IdProducto}>
                          <TableCell>
                            {r.NombreProducto}
                            <span className="ml-1 text-xs text-muted-foreground">{r.Sku}</span>
                          </TableCell>
                          <TableCell className="text-center">{r.Cantidad}</TableCell>
                          <TableCell className="text-center">{r.CodigoUnidad ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {moneda(r.Cantidad * r.CostoUnitario)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Aún sin repuestos.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {o.Situacion === "anulada" && o.MotivoReconciliacion && (
              <p className="text-sm text-destructive">
                <strong>Rechazo:</strong> {o.MotivoReconciliacion}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
