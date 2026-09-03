"use client";

/**
 * components/mantenimiento/DialogConsumirRepuestos.tsx
 *
 * Registra los repuestos USADOS en una OT. Genera la salida de inmediato
 * (consumo provisional, Model 2): DESCUENTA STOCK YA. El admin lo ratifica luego.
 * El editor de líneas es compartido con el alta de OT (EditorConsumoRepuestos).
 */
import { useState } from "react";
import { toast } from "sonner";
import { useConsumirRepuestos } from "@/hooks/useOrdenesMantenimiento";
import {
  EditorConsumoRepuestos,
  CONSUMO_INICIAL,
  validarConsumo,
  type ConsumoState,
} from "@/components/mantenimiento/EditorConsumoRepuestos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DialogConsumirRepuestos({
  idOrden,
  numeroOrden,
  onClose,
}: {
  idOrden: string;
  numeroOrden: string | null;
  onClose: () => void;
}) {
  const { mutateAsync, isPending } = useConsumirRepuestos();
  const [consumo, setConsumo] = useState<ConsumoState>({ ...CONSUMO_INICIAL });

  const onSubmit = async () => {
    const data = validarConsumo(consumo);
    if (!data) return;
    try {
      await mutateAsync({ id: idOrden, data });
      toast.success("Repuestos consumidos. Pendiente de aprobación.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consumir repuestos {numeroOrden ? `· OT ${numeroOrden}` : ""}</DialogTitle>
          <DialogDescription>
            Esto descuenta stock de inmediato. El admin lo ratifica después.
          </DialogDescription>
        </DialogHeader>

        <EditorConsumoRepuestos estado={consumo} onChange={setConsumo} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending}>
            {isPending ? "Consumiendo..." : "Consumir y descontar stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
