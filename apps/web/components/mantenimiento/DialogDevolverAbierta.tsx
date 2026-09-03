"use client";

/**
 * components/mantenimiento/DialogDevolverAbierta.tsx
 *
 * El aprobador devuelve una OT "por aprobar" al estado abierta.
 *
 * Es la salida intermedia que faltaba en la bandeja de aprobación: rechazar es un
 * veredicto (anula la orden), y hasta ahora era la única forma de sacar de la
 * bandeja algo que solo estaba incompleto. Devolver a abierta no juzga nada, solo
 * la manda de vuelta a trabajo conservando los repuestos ya cargados.
 *
 * El motivo es opcional pero se pide igual: queda guardado en la orden y es lo
 * único que le explica a quien la cargó por qué le volvió.
 */
import { useState } from "react";
import { Undo2 } from "lucide-react";
import {
  Dialog,
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
  onConfirmar,
  onCancelar,
}: {
  numeroOrden: string | null;
  procesando: boolean;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open onOpenChange={(v) => !v && onCancelar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Devolver a abierta
          </DialogTitle>
          <DialogDescription>
            {numeroOrden ? `La OT ${numeroOrden} ` : "La orden "}
            sale de la bandeja de aprobación y vuelve a ser editable. Los repuestos cargados se
            conservan y el stock no se toca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="MotivoDevolucion">Motivo (opcional)</Label>
          <Input
            id="MotivoDevolucion"
            placeholder="Ej: falta cargar el filtro de aceite"
            value={motivo}
            maxLength={400}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Queda registrado en la orden, para que quien la cargó sepa qué corregir.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirmar(motivo.trim())} disabled={procesando}>
            {procesando ? "Devolviendo..." : "Devolver a abierta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
