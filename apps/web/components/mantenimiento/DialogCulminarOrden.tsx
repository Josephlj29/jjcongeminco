"use client";

/**
 * components/mantenimiento/DialogCulminarOrden.tsx
 *
 * Culmina (cierra) una OT abierta SIN repuestos. Antes de cerrar exige evidencia
 * fotográfica: mín. 1 foto del estado actual y 1 de post-mantenimiento (la BD lo
 * vuelve a validar en FnCerrar). El botón "Cerrar orden" se habilita solo cuando
 * hay ≥1 de cada tipo.
 */
import { toast } from "sonner";
import { useFinalizarOrden } from "@/hooks/useOrdenesMantenimiento";
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
import { Button } from "@/components/ui/button";

export function DialogCulminarOrden({
  idOrden,
  numeroOrden,
  onClose,
}: {
  idOrden: string;
  numeroOrden: string | null;
  onClose: () => void;
}) {
  const { data: evidencias } = useEvidenciasMantenimiento(idOrden);
  const { mutateAsync: finalizar, isPending } = useFinalizarOrden();
  const completa = evidenciaCompleta(evidencias);

  const cerrar = async () => {
    try {
      await finalizar({ id: idOrden, anular: false });
      toast.success("Orden cerrada correctamente");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Culminar OT {numeroOrden ?? idOrden.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            Sube la evidencia fotográfica para cerrar la orden: al menos una foto del
            estado actual y una de post-mantenimiento.
          </DialogDescription>
        </DialogHeader>

        <EvidenciaMantenimiento idOrden={idOrden} editable />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void cerrar()} disabled={isPending || !completa}>
            {isPending ? "Cerrando..." : "Cerrar orden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
