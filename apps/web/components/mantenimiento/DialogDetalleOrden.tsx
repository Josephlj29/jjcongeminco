"use client";

/**
 * components/mantenimiento/DialogDetalleOrden.tsx
 *
 * Vista de solo lectura de una OT: cabecera, trabajos realizados (con sus fotos
 * de antes/después por tarea) y repuestos consumidos (costo congelado del ledger).
 */
import { useOrdenMantenimientoDetalle } from "@/hooks/useOrdenesMantenimiento";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ListaTrabajos } from "@/components/mantenimiento/ListaTrabajos";
import { fechaCorta } from "@/lib/format";

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

export function DialogDetalleOrden({ idOrden, onClose }: { idOrden: string; onClose: () => void }) {
  const { data: o, isLoading } = useOrdenMantenimientoDetalle(idOrden);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            OT {o?.NumeroOrden ?? idOrden.slice(0, 8)}
            {o && <Badge variant={SIT_VARIANTE[o.Situacion]}>{SIT_LABEL[o.Situacion]}</Badge>}
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
                {fechaCorta(o.FechaOrden)}
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
                <span className="text-muted-foreground">Horómetro: </span>
                {o.Horometro !== null ? o.Horometro : "—"}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Personal: </span>
                {o.Personales.length
                  ? o.Personales.map(
                      (p) => `${p.NombreCompleto ?? "—"}${p.Cargo ? ` · ${p.Cargo}` : ""}`,
                    ).join(", ")
                  : "—"}
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium">Trabajos realizados</h3>
              <ListaTrabajos trabajos={o.Trabajos} />
            </div>

            {o.Observaciones && (
              <div>
                <h3 className="mb-1 text-sm font-medium">Observaciones</h3>
                <p className="text-sm text-muted-foreground">{o.Observaciones}</p>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-medium">
                {o.StockDescontado ? "Repuestos consumidos" : "Repuestos (se descuentan al aprobar)"}
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="w-20 text-center">Cant.</TableHead>
                      <TableHead className="w-16 text-center">U.M</TableHead>
                      <TableHead className="w-28 text-right">Valor</TableHead>
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
                          Sin repuestos.
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
