"use client";

/**
 * components/mantenimiento/DialogReconciliarOrden.tsx
 *
 * El admin ratifica el consumo de una OT (situacion 'consumida'):
 *  - Aprobar → cierra la OT (el stock ya salió).
 *  - Rechazar → anula y genera una ENTRADA de reversa (contable, no física).
 * Muestra qué se consumió. No se edita: el consumo ya ocurrió.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useReconciliarOrden, useOrdenMantenimientoDetalle } from "@/hooks/useOrdenesMantenimiento";
import { useEvidenciasMantenimiento } from "@/hooks/useEvidenciasMantenimiento";
import {
  EvidenciaMantenimiento,
  evidenciaCompleta,
} from "@/components/mantenimiento/EvidenciaMantenimiento";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const TURNO_LABEL: Record<string, string> = { dia: "Día", tarde: "Tarde", noche: "Noche" };

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function DialogReconciliarOrden({
  idOrden,
  onClose,
}: {
  idOrden: string;
  onClose: () => void;
}) {
  const { data: orden, isLoading } = useOrdenMantenimientoDetalle(idOrden);
  const { data: evidencias } = useEvidenciasMantenimiento(idOrden);
  const { mutateAsync, isPending } = useReconciliarOrden();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const completa = evidenciaCompleta(evidencias);

  const total =
    orden?.Repuestos.reduce((acc, r) => acc + r.Cantidad * r.CostoUnitario, 0) ?? 0;

  const reconciliar = async (aprobar: boolean) => {
    if (!aprobar && !motivo.trim()) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }
    try {
      await mutateAsync({ id: idOrden, aprobar, motivo: aprobar ? undefined : motivo.trim() });
      toast.success(aprobar ? "Orden aprobada y cerrada." : "Orden rechazada. Stock revertido.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Reconciliar OT {orden?.NumeroOrden ?? idOrden.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Ratifica el consumo de repuestos que ya descontó stock.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !orden ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Placa: </span>
                {orden.Placa ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Tipo: </span>
                {orden.TipoMantenimiento === "correctivo" ? "Correctivo" : "Preventivo"}
              </div>
              <div>
                <span className="text-muted-foreground">Personal: </span>
                {orden.Personales.length
                  ? orden.Personales.map((p) => p.NombreCompleto ?? "—").join(", ")
                  : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Turno: </span>
                {TURNO_LABEL[orden.Turno] ?? orden.Turno}
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repuesto</TableHead>
                    <TableHead className="text-center w-20">Cant.</TableHead>
                    <TableHead className="text-center w-16">U.M</TableHead>
                    <TableHead className="text-right w-28">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orden.Repuestos.map((r) => (
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
                  ))}
                  {!orden.Repuestos.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sin repuestos consumidos
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="text-right text-sm">
              Total consumido: <strong>{moneda(total)}</strong>
            </div>

            {!rechazando && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Evidencia fotográfica</p>
                <p className="text-xs text-muted-foreground">
                  Para aprobar y cerrar la orden, sube al menos una foto del estado actual
                  y una de post-mantenimiento.
                </p>
                <EvidenciaMantenimiento idOrden={idOrden} editable />
              </div>
            )}

            {rechazando && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-tight">
                    Rechazar genera una <strong>entrada de reversa contable</strong> que devuelve
                    el stock al sistema. Si el repuesto ya se instaló físicamente, el almacén
                    mostrará stock que no está en el estante. Usa el rechazo para
                    <strong> errores de carga</strong>.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="motivo">Motivo del rechazo *</Label>
                  <Input
                    id="motivo"
                    placeholder="Ej: cantidad mal registrada"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              {!rechazando ? (
                <>
                  <Button variant="outline" onClick={() => setRechazando(true)} disabled={isPending}>
                    Rechazar
                  </Button>
                  <Button
                    onClick={() => reconciliar(true)}
                    disabled={isPending || !completa}
                    title={!completa ? "Sube al menos una foto de cada tipo para aprobar." : undefined}
                  >
                    {isPending ? "Procesando..." : "Aprobar"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setRechazando(false)} disabled={isPending}>
                    Volver
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => reconciliar(false)}
                    disabled={isPending}
                  >
                    {isPending ? "Procesando..." : "Confirmar rechazo"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
