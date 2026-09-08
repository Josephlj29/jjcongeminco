"use client";

/**
 * components/movimientos/DialogAnularDocumento.tsx
 *
 * Anula un documento confirmado. El ledger es append-only: anular NO borra nada,
 * emite el documento inverso y deja el original marcado. El motivo es obligatorio
 * porque no hay bitácora: queda en las notas de ambos documentos.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAnularDocumento } from "@/hooks/useDocumentos";
import type { DocumentoInventarioResumen } from "@congeminco/shared";

interface Props {
  documento: DocumentoInventarioResumen;
  onClose: () => void;
}

export function DialogAnularDocumento({ documento, onClose }: Props) {
  const [motivo, setMotivo] = useState("");
  const { mutateAsync, isPending } = useAnularDocumento();

  const anular = async () => {
    try {
      await mutateAsync({ id: documento.Id, Motivo: motivo.trim() });
      toast.success(`Documento ${documento.NumeroDocumento ?? ""} anulado con su reversa.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular el documento.");
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular documento {documento.NumeroDocumento ?? ""}</AlertDialogTitle>
          <AlertDialogDescription>
            Se emite un documento inverso que deshace el movimiento y este queda marcado como
            anulado. Ambos siguen visibles en el kardex.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogBody className="space-y-2">
          <Label htmlFor="motivo-anular">Motivo</Label>
          <Textarea
            id="motivo-anular"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se anula (queda en las notas del documento)"
            maxLength={300}
            autoFocus
          />
          {motivo.trim().length > 0 && motivo.trim().length < 5 && (
            <p className="text-xs text-destructive">Escribe al menos 5 caracteres.</p>
          )}
        </AlertDialogBody>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={anular}
            disabled={isPending || motivo.trim().length < 5}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            {isPending ? "Anulando..." : "Anular con reversa"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
