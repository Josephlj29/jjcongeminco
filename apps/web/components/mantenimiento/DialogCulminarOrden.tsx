"use client";

/**
 * components/mantenimiento/DialogCulminarOrden.tsx
 *
 * Confirmación de "Culminar" para una OT abierta.
 *
 * Una sola acción resuelve los dos casos, que es como lo piensa el usuario, pero
 * el destino cambia según los repuestos y eso NO puede ser una sorpresa: culminar
 * con repuestos manda la orden a aprobación (y ahí sí se descuenta stock),
 * mientras que sin repuestos la cierra de una. El modal dice cuál de los dos va a
 * pasar ANTES de confirmar; por eso el texto se arma con `tieneRepuestos` y no es
 * un mensaje genérico.
 */
import { AlertTriangle, ClipboardCheck, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DialogCulminarOrden({
  numeroOrden,
  tieneRepuestos,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  numeroOrden: string | null;
  /** Decide el destino y, por lo tanto, todo el texto del modal. */
  tieneRepuestos: boolean;
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(v) => !v && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {tieneRepuestos ? (
              <ClipboardCheck className="h-5 w-5 text-primary" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
            Culminar {numeroOrden ? `OT ${numeroOrden}` : "la orden"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {tieneRepuestos ? (
                <>
                  <p>
                    Esta orden tiene <strong>repuestos cargados</strong>, así que pasa a{" "}
                    <strong>Por aprobar</strong>.
                  </p>
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-xs leading-tight">
                      El stock todavía no se descuenta. Se descuenta recién cuando un administrador
                      aprueba la orden.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Esta orden <strong>no tiene repuestos cargados</strong>, así que se{" "}
                    <strong>cierra</strong> directamente.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    No genera movimientos de stock: queda como trabajo de solo mano de obra. Si
                    faltaba cargar repuestos, cancelá y agregalos desde &quot;Editar&quot;.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={procesando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar} disabled={procesando}>
            {procesando
              ? "Culminando..."
              : tieneRepuestos
                ? "Culminar y enviar a aprobación"
                : "Culminar y cerrar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
