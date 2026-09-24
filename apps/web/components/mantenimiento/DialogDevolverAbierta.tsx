"use client";

/**
 * components/mantenimiento/DialogDevolverAbierta.tsx
 *
 * Devuelve una OT al estado abierta. Cubre dos casos con el mismo formulario:
 *
 *  - Desde "por aprobar" (aprobador): es la salida intermedia de la bandeja.
 *    Rechazar es un veredicto (anula la orden); devolver a abierta no juzga
 *    nada, solo la manda de vuelta a trabajo con los repuestos ya cargados.
 *  - Desde "cerrada" (solo admin, `desdeCerrada`): deshace un cierre por error.
 *    Una orden que se culmina sin repuestos se cierra sin pasar por aprobación,
 *    así que este es el único camino de vuelta. Nunca si ya descontó stock.
 *
 * El motivo es opcional pero se pide igual: queda guardado en la orden y es lo
 * único que le explica a quien la cargó por qué le volvió.
 */
import { useState } from "react";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DialogDevolverAbierta({
  numeroOrden,
  procesando,
  desdeCerrada = false,
  onConfirmar,
  onCancelar,
}: {
  numeroOrden: string | null;
  procesando: boolean;
  /** true cuando la orden está cerrada: cambia el texto, no el formulario. */
  desdeCerrada?: boolean;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const titulo = desdeCerrada ? "Reabrir orden" : "Devolver a abierta";

  return (
    <Dialog open onOpenChange={(v) => !v && onCancelar()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            {titulo}
          </DialogTitle>
          <DialogDescription>
            {numeroOrden ? `La OT ${numeroOrden} ` : "La orden "}
            {desdeCerrada
              ? "vuelve al estado abierta para corregirla y culminarla de nuevo."
              : "sale de la bandeja de aprobación y vuelve a ser editable."}{" "}
            Los trabajos y repuestos cargados se conservan y el stock no se toca.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-1">
          <Label htmlFor="MotivoDevolucion">Motivo (opcional)</Label>
          <Input
            id="MotivoDevolucion"
            placeholder={
              desdeCerrada
                ? "Ej: se cerró sin cargar los repuestos consumidos"
                : "Ej: falta cargar el filtro de aceite"
            }
            value={motivo}
            maxLength={400}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Queda registrado en la orden, para que quien la cargó sepa qué corregir.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirmar(motivo.trim())} disabled={procesando}>
            {procesando ? "Procesando..." : titulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
