"use client";

/**
 * components/mantenimiento/DialogReconciliarOrden.tsx
 *
 * El admin revisa una OT "Por aprobar" (situacion 'consumida'):
 *  - Aprobar → descuenta el stock del BORRADOR de repuestos y cierra la OT.
 *  - Rechazar → anula la OT sin tocar el stock (todavía no se descontó).
 * Legado (OTs que ya descontaron stock al registrarse, StockDescontado): aprobar
 * solo cierra; rechazar genera la ENTRADA de reversa contable.
 * Muestra los trabajos con sus fotos por tarea (la evidencia que respalda el
 * consumo) y los repuestos. Si al revisar falta o sobra un repuesto, se corrige
 * desde acá con el diálogo de edición (mientras no se haya descontado stock), sin
 * rechazar la OT. Las fotos son opcionales: aprobar no exige ninguna.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil } from "lucide-react";
import { useReconciliarOrden, useOrdenMantenimientoDetalle } from "@/hooks/useOrdenesMantenimiento";
import { usePermiso } from "@/hooks/useYo";
import { DialogOrdenMantenimiento } from "@/components/mantenimiento/DialogOrdenMantenimiento";
import { ListaTrabajos } from "@/components/mantenimiento/ListaTrabajos";
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
  const { mutateAsync, isPending } = useReconciliarOrden();
  const [rechazando, setRechazando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const puedeEditar = usePermiso("requerimientoCrear");
  // Legado: ya descontó stock al registrarse; el borrador ya no se edita.
  const descontado = orden?.StockDescontado ?? false;

  const total = orden?.Repuestos.reduce((acc, r) => acc + r.Cantidad * r.CostoUnitario, 0) ?? 0;

  const reconciliar = async (aprobar: boolean) => {
    if (!aprobar && !motivo.trim()) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }
    try {
      await mutateAsync({ id: idOrden, aprobar, motivo: aprobar ? undefined : motivo.trim() });
      toast.success(
        aprobar
          ? descontado
            ? "Orden aprobada y cerrada."
            : "Orden aprobada: stock descontado y orden cerrada."
          : descontado
            ? "Orden rechazada. Stock revertido."
            : "Orden rechazada.",
      );
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconciliar OT {orden?.NumeroOrden ?? idOrden.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            {descontado
              ? "Revisa los trabajos, sus fotos y los repuestos. Esta orden ya descontó stock: aprobar solo la cierra."
              : "Revisa los trabajos, sus fotos y los repuestos. Aprobar descuenta el stock y cierra la orden."}
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

            <div className="space-y-1 rounded-md border p-3">
              <p className="text-sm font-medium">Trabajos realizados</p>
              <ListaTrabajos trabajos={orden.Trabajos} />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {descontado ? "Repuestos consumidos" : "Repuestos a descontar al aprobar"}
              </p>
              {puedeEditar && !descontado && !rechazando && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditando(true)}
                  disabled={isPending}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Editar orden
                </Button>
              )}
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repuesto</TableHead>
                    <TableHead className="w-20 text-center">Cant.</TableHead>
                    <TableHead className="w-16 text-center">U.M</TableHead>
                    <TableHead className="w-28 text-right">Valor</TableHead>
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
                        Sin repuestos
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="text-right text-sm">
              {descontado ? "Total consumido" : "Total estimado"}: <strong>{moneda(total)}</strong>
            </div>

            {rechazando && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {descontado ? (
                    <p className="text-xs leading-tight">
                      Rechazar genera una <strong>entrada de reversa contable</strong> que devuelve
                      el stock al sistema. Si el repuesto ya se instaló físicamente, el almacén
                      mostrará stock que no está en el estante. Usa el rechazo para
                      <strong> errores de carga</strong>.
                    </p>
                  ) : (
                    <p className="text-xs leading-tight">
                      Rechazar <strong>anula la orden</strong>. El stock no se toca porque todavía
                      no se descontó. Si solo hay que corregir un repuesto o una tarea, usa
                      <strong> Editar orden</strong> en vez de rechazar.
                    </p>
                  )}
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
                  <Button
                    variant="outline"
                    onClick={() => setRechazando(true)}
                    disabled={isPending}
                  >
                    Rechazar
                  </Button>
                  <Button onClick={() => reconciliar(true)} disabled={isPending}>
                    {isPending ? "Procesando..." : "Aprobar"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setRechazando(false)}
                    disabled={isPending}
                  >
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

      {/* Edición del borrador (cabecera, tareas, repuestos) sin salir de la revisión;
          al cerrar, el detalle se refresca solo (misma query invalidada). */}
      {editando && orden && (
        <DialogOrdenMantenimiento orden={orden} onClose={() => setEditando(false)} />
      )}
    </Dialog>
  );
}
